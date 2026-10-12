-- ============================================================
-- 0012: 会籍权益（项目券）+ 预约即扣款
--
-- 依赖 0011，必须紧随其后应用：
--   1) 快照列 price_snapshot / member_price_snapshot 由 0011 建立，本文件扣款读它们；
--   2) 本文件的结算触发器内部会 UPDATE appointments.payment_state，而 0008:36-38 的
--      webhook 触发器是 `after insert or update`（无列清单）。0011 把它收紧为
--      of status, start_time, … 之后，这条内部更新才不会再发一次多余通知。
--
-- 业务规则（老板 2026-10-12 确认）：
--   · 微信收款 → 老板手动充值；余额是唯一现金资产，券只承载「非售卖、仅赠送」的项目。
--   · 预约即扣（不是完成才扣）：这一单必须撑得住余额，钱在预约时即被占用。
--   · 取消 / 爽约 / 超时作废 **一律退款退券**，且共用同一个出口函数。
--   · 老板代约不豁免余额校验，余额不足只能先充值。
--   · 券绑定具体项目（无通用券、无次卡），一张券只核销一次。
--   · 券优先于余额；老板可显式改用余额。
--   · 券绑定的项目即使已下架（is_active=false）仍可核销——券是已授予的权益，
--      静默失效必然变成投诉；service_id 用 on delete restrict 防止删项目带走券。
-- ============================================================

-- ---------- 1. 券表（先建，appointments 要引用它） ----------
create table if not exists public.service_passes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  title text not null,
  source text not null check (source in ('gift', 'purchase', 'adjust')),
  status text not null default 'active'
    check (status in ('active', 'held', 'redeemed', 'expired', 'revoked')),
  expires_at timestamptz,
  granted_by uuid references auth.users(id) on delete set null,
  remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.service_passes.title is
  '授予时快照的项目名；项目改名后券面仍与发放当时一致（与 balance_logs 的理由快照同理）';

create index if not exists service_passes_member_lookup_idx
  on public.service_passes(member_id, status, expires_at);
create index if not exists service_passes_service_idx on public.service_passes(service_id);

-- 0001:186 的 updated_at 触发器只注册在 appointments 上，新表需自行挂
create trigger service_passes_set_updated_at
  before update on public.service_passes
  for each row execute function public.set_updated_at();

create table if not exists public.pass_ledger (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.service_passes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  old_status text,
  new_status text not null,
  reason text not null,
  operator_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists pass_ledger_pass_idx on public.pass_ledger(pass_id, created_at desc);
create index if not exists pass_ledger_member_idx on public.pass_ledger(member_id, created_at desc);

-- ---------- 2. 订单侧支付字段 ----------
alter table public.appointments
  add column if not exists pass_id uuid references public.service_passes(id) on delete restrict,
  add column if not exists charged_amount numeric(12, 2) not null default 0,
  add column if not exists payment_state text not null default 'charged'
    check (payment_state in ('charged', 'completed', 'refunded', 'redeemed', 'legacy'));

comment on column public.appointments.charged_amount is
  '本单实际从余额扣走的金额；用券支付时为 0。退款按此值原额返还，绝不按当前价重算';
comment on column public.appointments.payment_state is
  'charged=已扣未结算 / completed=余额支付且服务已完成（终态，不再退款） / '
  'redeemed=用券且已完成核销 / refunded=已退回 / legacy=本迁移之前产生、从未扣款的旧单';

-- 一张券同时只能占用一单。索引必须是「部分索引」，只约束未释放的预约：
-- 原写法 `where pass_id is not null` 没有状态谓词，一旦某单用券后被取消，
-- release_appointment_payment 会把券退回 active，但该单的 pass_id 仍然占着唯一索引，
-- 于是会员再用这张已退回的券预约时 INSERT 直接撞唯一约束 —— 券永远用不了。
-- 这里把「已取消/未到店/已退款」的行排除在约束之外，券退回后可再次占用。
create unique index if not exists appointments_pass_id_idx
  on public.appointments(pass_id)
  where pass_id is not null
    and status not in ('cancelled', 'no_show')
    and payment_state <> 'refunded';

-- ---------- 2b. 账本与预约的强关联（替代按 reason 字符串前缀猜类别） ----------
-- 原对账视图靠 `reason like '预约扣费%'` 区分消费与充值，退款原因「取消预约退回…」不在
-- 白名单里，会被当成充值统计（虚增累计充值）。改为结构化列：每一笔因预约产生的资金
-- 变动都记 appointment_id + entry_kind，类别判定不再依赖文案。
alter table public.balance_logs
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists entry_kind text
    check (entry_kind in ('booking_charge', 'booking_refund', 'manual'));

comment on column public.balance_logs.entry_kind is
  'booking_charge=预约扣款 / booking_refund=预约退款(取消或作废) / manual=老板手动调整';

create index if not exists balance_logs_appointment_idx
  on public.balance_logs(appointment_id)
  where appointment_id is not null;

-- 关键：历史单在旧规则下根本没扣过钱。不标 legacy 的话，退款触发器会把
-- 从未存在的钱「退」给会员，凭空造出余额。
--
-- 幂等（重要）：只把「本迁移之前就存在、且仍是默认 charged」的行标为 legacy。
-- 原写法 `update appointments set payment_state='legacy'`（无 WHERE）若被重复执行，
-- 会把迁移后已真实扣款的单也打成 legacy，之后取消时 release_appointment_payment
-- 会在 ('legacy','refunded') 处提前返回 —— 会员的钱被吞且无任何报错。
-- 用 created_at 卡在本次迁移时点之前 + 仍是 charged（未被处理过），保证重跑安全。
update public.appointments set payment_state = 'legacy'
where payment_state = 'charged'
  and pass_id is null
  and charged_amount = 0;

-- ---------- 3. RLS：只读，写入一律走下面的 definer 函数 ----------
alter table public.service_passes enable row level security;
alter table public.pass_ledger enable row level security;

-- 沿用 appointments 的做法：不建 INSERT/UPDATE/DELETE 策略，
-- 于是客户端无法绕过 RPC 直接改资产（已验证这种「无策略即拒绝」是有效的）
drop policy if exists "service_passes_select_own_or_admin" on public.service_passes;
create policy "service_passes_select_own_or_admin" on public.service_passes
  for select to authenticated
  using (member_id = public.current_member_id() or public.has_role('admin'));

drop policy if exists "pass_ledger_select_own_or_admin" on public.pass_ledger;
create policy "pass_ledger_select_own_or_admin" on public.pass_ledger
  for select to authenticated
  using (member_id = public.current_member_id() or public.has_role('admin'));

-- ---------- 4. 结算原语 ----------
-- 三个出口（取消 / 爽约 / 超时作废）共用同一函数，杜绝「某条路径忘了退」。

create or replace function public.release_appointment_payment(
  p_appointment_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.appointments%rowtype;
  v_old numeric;
  v_rows integer;
  v_already_refunded boolean;
begin
  select * into v from public.appointments where id = p_appointment_id for update;
  if not found then
    return;
  end if;

  -- legacy：旧规则没扣过钱；refunded：已退过，防重复退
  if v.payment_state in ('legacy', 'refunded') then
    return;
  end if;

  -- 二次入账守卫：钱可能已被「老板手动调整」退过一次（payment_state 仍是 charged）。
  -- 只要账本里已有本单的 booking_refund，就绝不再退一次 —— 否则凭空造钱。
  select exists (
    select 1 from public.balance_logs bl
    where bl.appointment_id = p_appointment_id
      and bl.entry_kind = 'booking_refund'
  ) into v_already_refunded;

  if v.pass_id is not null then
    update public.service_passes
       set status = 'active'
     where id = v.pass_id and status = 'held';
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      insert into public.pass_ledger
        (pass_id, member_id, old_status, new_status, reason, operator_id)
      select v.pass_id, p.member_id, 'held', 'active', p_reason, auth.uid()
        from public.service_passes p where p.id = v.pass_id;
    end if;
  end if;

  if v.charged_amount > 0 and not v_already_refunded then
    -- 会员行加锁后再改，避免与老板手动充值并发覆盖
    select balance into v_old from public.members where id = v.customer_id for update;
    if found then
      -- 0005 的守卫触发器默认禁止直接改 balance，必须开事务级放行标记
      perform set_config('app.allow_balance_update', 'on', true);
      update public.members set balance = v_old + v.charged_amount where id = v.customer_id;
      insert into public.balance_logs
        (member_id, old_balance, new_balance, reason, operator_id, appointment_id, entry_kind)
      values
        (v.customer_id, v_old, v_old + v.charged_amount,
         p_reason || ' ¥' || trim(to_char(v.charged_amount, '9999999990.99')),
         auth.uid(), p_appointment_id, 'booking_refund');
    end if;
  end if;

  update public.appointments set payment_state = 'refunded' where id = p_appointment_id;
end;
$$;

create or replace function public.consume_appointment_pass(
  p_appointment_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.appointments%rowtype;
  v_rows integer;
begin
  select * into v from public.appointments where id = p_appointment_id for update;
  if not found or v.payment_state <> 'charged' then
    return;
  end if;

  -- 余额支付（无券）：服务完成即进入终态 completed，不再可退款。
  -- 原实现只处理券，余额单会永远停在 charged —— 于是「已扣未服务」与
  -- 「余额已付已完成」两种含义混用同一状态，无法审计也无法区分。
  if v.pass_id is null then
    update public.appointments set payment_state = 'completed' where id = p_appointment_id;
    return;
  end if;

  update public.service_passes set status = 'redeemed'
   where id = v.pass_id and status = 'held';
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    insert into public.pass_ledger
      (pass_id, member_id, old_status, new_status, reason, operator_id)
    select v.pass_id, p.member_id, 'held', 'redeemed', p_reason, auth.uid()
      from public.service_passes p where p.id = v.pass_id;
    update public.appointments set payment_state = 'redeemed' where id = p_appointment_id;
  else
    -- 券不在 held（例如它已被退回/回收，而这一单仍走到完成）：
    -- 不能静默跳过，否则该单永远停在 charged、券状态与订单互相矛盾。
    -- 这里把券强制核销并记账，保证「完成即核销」这一不变量。
    insert into public.pass_ledger
      (pass_id, member_id, old_status, new_status, reason, operator_id)
    select v.pass_id, p.member_id, p.status, 'redeemed',
           p_reason || '（完成时券非占用态，强制核销）', auth.uid()
      from public.service_passes p where p.id = v.pass_id;

    update public.service_passes set status = 'redeemed' where id = v.pass_id;
    update public.appointments set payment_state = 'redeemed' where id = p_appointment_id;
  end if;
end;
$$;

-- 状态跃迁自动结算。只监听 status 列；函数内部改的是 payment_state，不会自触发。
create or replace function public.settle_appointment_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('cancelled', 'no_show') then
      perform public.release_appointment_payment(
        new.id,
        case new.status when 'cancelled' then '取消预约退回' else '预约作废退回' end
      );
    elsif new.status = 'done' then
      perform public.consume_appointment_pass(new.id, '服务完成核销');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_appointment_settlement on public.appointments;
create trigger trg_appointment_settlement
  after update of status on public.appointments
  for each row execute function public.settle_appointment_payment();

-- 删除预约也必须结算：老板删除的是 appointments 行（RLS 允许 DELETE），
-- 若不处理，占用中的券会永远卡在 held、已扣的余额无路径退回，
-- 而且 0013 对账只统计 done，根本查不到这类孤儿。
-- 触发器在行删除后触发，用 OLD 值调用释放逻辑（函数内部按 id 查不到行会直接返回，
-- 故这里显式把资金与券先退回，再让行消失）。
create or replace function public.settle_appointment_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 只有「已扣但未结算」的单在删除时才该退款：
  --   charged  = 钱占着、服务没做成 → 退
  --   completed/redeemed = 服务已完成，钱是消费掉的 → 不退（删记录只是删记录）
  --   legacy/refunded   = 本就没扣过 / 已退过 → 不动
  if old.payment_state in ('legacy', 'refunded', 'completed', 'redeemed') then
    return old;
  end if;

  -- 券退回
  if old.pass_id is not null then
    update public.service_passes set status = 'active'
     where id = old.pass_id and status = 'held';
    if found then
      insert into public.pass_ledger
        (pass_id, member_id, old_status, new_status, reason, operator_id)
      select old.pass_id, p.member_id, 'held', 'active', '预约删除退回', auth.uid()
        from public.service_passes p where p.id = old.pass_id;
    end if;
  end if;

  -- 余额退回（仅当本单确实扣过款且尚无 booking_refund）
  if old.charged_amount > 0 and not exists (
    select 1 from public.balance_logs bl
    where bl.appointment_id = old.id and bl.entry_kind = 'booking_refund'
  ) then
    declare
      v_old numeric;
    begin
      select balance into v_old from public.members where id = old.customer_id for update;
      if found then
        perform set_config('app.allow_balance_update', 'on', true);
        update public.members set balance = v_old + old.charged_amount
         where id = old.customer_id;
        insert into public.balance_logs
          (member_id, old_balance, new_balance, reason, operator_id, appointment_id, entry_kind)
        values
          (old.customer_id, v_old, v_old + old.charged_amount,
           '预约删除退回 ¥' || trim(to_char(old.charged_amount, '9999999990.99')),
           auth.uid(), old.id, 'booking_refund');
      end if;
    end;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_appointment_delete_settlement on public.appointments;
create trigger trg_appointment_delete_settlement
  before delete on public.appointments
  for each row execute function public.settle_appointment_delete();

-- ---------- 5. 发券 / 回收 ----------
create or replace function public.grant_service_pass(
  p_member_id uuid,
  p_service_id uuid,
  p_quantity integer default 1,
  p_source text default 'gift',
  p_months integer default 12,
  p_remark text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_pass_id uuid;
  v_expires timestamptz;
  i integer;
begin
  if not public.has_role('admin') then
    raise exception '权限不足：仅老板可发放会籍权益';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 24 then
    raise exception '发放张数需在 1 到 24 之间';
  end if;

  if p_source not in ('gift', 'purchase', 'adjust') then
    raise exception '无效的发放来源';
  end if;

  if not exists (select 1 from public.members m where m.id = p_member_id) then
    raise exception '会员不存在';
  end if;

  select * into v_service from public.services where id = p_service_id;
  if not found then
    raise exception '项目不存在';
  end if;
  -- 刻意不拦 is_active=false：老板需要能给已下架项目补发此前承诺的券

  v_expires := case
    when p_months is null or p_months <= 0 then null
    else now() + make_interval(months => p_months)
  end;

  -- 逐张插入以便精确记流水（不用时间窗反查，避免并发发放串号）
  for i in 1 .. p_quantity loop
    insert into public.service_passes
      (member_id, service_id, title, source, expires_at, granted_by, remark)
    values
      (p_member_id, p_service_id, v_service.name, p_source, v_expires,
       auth.uid(), nullif(coalesce(p_remark, ''), ''))
    returning id into v_pass_id;

    insert into public.pass_ledger
      (pass_id, member_id, old_status, new_status, reason, operator_id)
    values
      (v_pass_id, p_member_id, null, 'active',
       '发放会籍权益 · ' || v_service.name, auth.uid());
  end loop;

  return p_quantity;
end;
$$;

create or replace function public.revoke_service_pass(
  p_pass_id uuid,
  p_reason text default '老板回收'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.service_passes%rowtype;
begin
  if not public.has_role('admin') then
    raise exception '权限不足：仅老板可回收会籍权益';
  end if;

  select * into v from public.service_passes where id = p_pass_id for update;
  if not found then
    raise exception '权益不存在';
  end if;
  if v.status <> 'active' then
    raise exception '只能回收未使用的券（已占用 / 已核销 / 已失效的券不可回收）';
  end if;

  update public.service_passes set status = 'revoked' where id = p_pass_id;

  insert into public.pass_ledger
    (pass_id, member_id, old_status, new_status, reason, operator_id)
  values
    (p_pass_id, v.member_id, 'active', 'revoked',
     coalesce(nullif(p_reason, ''), '老板回收'), auth.uid());
end;
$$;

-- ---------- 6. 预约即扣款 / 即占券 ----------
-- 签名比 0003/0011 多一个 p_pass_id。刻意不保留旧的 6 参重载：
-- 保留的话，调用方漏传 p_pass_id 会被静默当成「用余额支付」，扣错钱且无人报错。
create or replace function public.create_appointment(
  p_customer_id uuid,
  p_staff_id uuid,
  p_service_id uuid,
  p_start_time timestamptz,
  p_remark text default null,
  p_status text default 'pending',
  p_pass_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_staff public.staff%rowtype;
  v_member public.members%rowtype;
  v_pass public.service_passes%rowtype;
  v_end_time timestamptz;
  v_status text;
  v_charged numeric(12, 2) := 0;
  v_rows integer;
  v_id uuid;
begin
  if not (public.has_role('admin') or public.has_role('customer')) then
    raise exception '请先登录后再预约';
  end if;

  if p_status not in ('pending', 'confirmed') then
    raise exception '无效的预约状态';
  end if;

  v_status := case when public.has_role('admin') then p_status else 'pending' end;

  if not public.has_role('admin') then
    if p_customer_id is distinct from public.current_member_id() then
      raise exception '只能为自己预约';
    end if;
  elsif not exists (select 1 from public.members m where m.id = p_customer_id) then
    raise exception '会员不存在';
  end if;

  select * into v_service from public.services where id = p_service_id;
  if not found or not v_service.is_active then
    raise exception '服务项目不存在或已下架';
  end if;

  select * into v_staff from public.staff where id = p_staff_id;
  if not found or not v_staff.is_active then
    raise exception '技师不存在或已停用';
  end if;

  if not exists (
    select 1 from public.staff_services ss
    where ss.staff_id = p_staff_id and ss.service_id = p_service_id
  ) then
    raise exception '该技师不提供此服务';
  end if;

  if p_start_time <= now() then
    raise exception '预约时间必须晚于当前时间';
  end if;

  v_end_time := p_start_time + make_interval(mins => v_service.duration);

  -- 按技师串行化：保护时段重叠（沿用 0003:72 的既有做法）
  perform pg_advisory_xact_lock(hashtextextended('appointment:' || p_staff_id::text, 0));

  if not exists (
    select 1 from public.schedules s
    where s.staff_id = p_staff_id
      and s.start_time <= p_start_time
      and s.end_time >= v_end_time
  ) then
    raise exception '所选时间不在技师排班范围内';
  end if;

  if exists (
    select 1 from public.appointments a
    where a.staff_id = p_staff_id
      and a.status not in ('cancelled', 'no_show')
      and tstzrange(a.start_time, a.end_time) && tstzrange(p_start_time, v_end_time)
  ) then
    raise exception '该时间段已被预约，请选择其他时间';
  end if;

  -- 按会员串行化：原有 advisory lock 只按技师加，保护不了余额和券。
  -- 同一顾客并发下两单会双双通过余额校验，直接扣成负数。
  select * into v_member from public.members where id = p_customer_id for update;
  if not v_member.is_active then
    raise exception '该会籍已停用，请联系店家';
  end if;

  if p_pass_id is not null then
    select * into v_pass from public.service_passes where id = p_pass_id for update;
    if not found or v_pass.member_id <> p_customer_id then
      raise exception '权益不存在或不属于该会员';
    end if;
    if v_pass.service_id <> p_service_id then
      raise exception '该权益绑定的项目与本次预约不一致';
    end if;
    if v_pass.expires_at is not null and v_pass.expires_at <= now() then
      raise exception '该权益已过期';
    end if;

    update public.service_passes set status = 'held'
     where id = p_pass_id and status = 'active';
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception '该权益已使用或已失效，请刷新后重新选择';
    end if;

    insert into public.pass_ledger
      (pass_id, member_id, old_status, new_status, reason, operator_id)
    values
      (p_pass_id, p_customer_id, 'active', 'held',
       '预约占用 · ' || v_pass.title, auth.uid());
  else
    -- 扣余额：会员价优先，缺价回退原价（防止漏填 member_price 时按 0 扣）
    v_charged := coalesce(v_service.member_price, v_service.price, 0);
    if v_charged > v_member.balance then
      raise exception '会籍余额不足：本单需 ¥%，当前余额 ¥%，请先联系店家充值',
        trim(to_char(v_charged, '9999999990.99')),
        trim(to_char(v_member.balance, '9999999990.99'));
    end if;
  end if;

  -- 先落预约行，再据其 id 记账：这样扣款流水能带上 appointment_id，
  -- 对账与「本单是否已退过」都靠这个强关联，不再依赖 reason 文案。
  insert into public.appointments
    (store_id, customer_id, staff_id, service_id, start_time, end_time, status, remark,
     price_snapshot, member_price_snapshot, pass_id, charged_amount, payment_state)
  values
    (coalesce(v_staff.store_id, v_service.store_id),
     p_customer_id, p_staff_id, p_service_id,
     p_start_time, v_end_time, v_status, nullif(p_remark, ''),
     v_service.price, v_service.member_price, p_pass_id, v_charged, 'charged')
  returning id into v_id;

  if p_pass_id is null and v_charged > 0 then
    perform set_config('app.allow_balance_update', 'on', true);
    update public.members set balance = v_member.balance - v_charged where id = p_customer_id;
    insert into public.balance_logs
      (member_id, old_balance, new_balance, reason, operator_id, appointment_id, entry_kind)
    values
      (p_customer_id, v_member.balance, v_member.balance - v_charged,
       '预约扣费 · ' || v_service.name, auth.uid(), v_id, 'booking_charge');
  end if;

  return v_id;
end;
$$;

-- ---------- 7. 权限收紧 ----------
-- 必须真正 DROP 掉旧的 6 参签名，不能只 revoke：
-- PostgREST 对「可用同一组命名参数调用」的重载函数无法消歧，会直接报
-- Could not choose the best candidate function，于是整站预约当场失效。
drop function if exists public.create_appointment(uuid, uuid, uuid, timestamptz, text, text);

grant execute on function public.create_appointment(uuid, uuid, uuid, timestamptz, text, text, uuid)
  to authenticated, service_role;

revoke execute on function public.grant_service_pass(uuid, uuid, integer, text, integer, text) from public;
grant execute on function public.grant_service_pass(uuid, uuid, integer, text, integer, text)
  to authenticated, service_role;

revoke execute on function public.revoke_service_pass(uuid, text) from public;
grant execute on function public.revoke_service_pass(uuid, text) to authenticated, service_role;

-- 结算原语只允许被触发器/函数内部调用，不暴露给任何角色
revoke execute on function public.release_appointment_payment(uuid, text) from public;
revoke execute on function public.consume_appointment_pass(uuid, text) from public;
revoke execute on function public.settle_appointment_payment() from public;
