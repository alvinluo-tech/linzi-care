-- ============================================================
-- 0011: 营收口径固化 + 待确认时段回收 + Webhook 触发器收紧
-- 注意：本文件只是写入仓库，未执行 supabase db push（需老板确认后再上线）
-- ============================================================

-- ---------- 1. 预约价格快照 ----------
-- 现状：报表营收用「查询当时的 services.price」回算（src/app/admin/reports/page.tsx:121），
-- 改价会追溯改写历史营收，且 member_price 从未参与计价。
-- 这里给 appointments 落一个下单时点的价格快照，报表改读快照。
alter table public.appointments
  add column if not exists price_snapshot numeric(12, 2),
  add column if not exists member_price_snapshot numeric(12, 2);

comment on column public.appointments.price_snapshot is
  '创建预约时的服务单价快照；历史营收以此为准，不随 services.price 调整而变化';

-- 历史数据回填：只能按「当前价」近似，回填后与当时真实成交价可能存在差异
update public.appointments a
set price_snapshot = s.price,
    member_price_snapshot = s.member_price
from public.services s
where a.service_id = s.id
  and a.price_snapshot is null;

-- 由创建时点写入快照
create or replace function public.create_appointment(
  p_customer_id uuid,
  p_staff_id uuid,
  p_service_id uuid,
  p_start_time timestamptz,
  p_remark text default null,
  p_status text default 'pending'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_staff public.staff%rowtype;
  v_end_time timestamptz;
  v_status text;
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

  insert into public.appointments
    (store_id, customer_id, staff_id, service_id, start_time, end_time, status, remark,
     price_snapshot, member_price_snapshot)
  values
    (coalesce(v_staff.store_id, v_service.store_id),
     p_customer_id, p_staff_id, p_service_id,
     p_start_time, v_end_time, v_status, nullif(p_remark, ''),
     v_service.price, v_service.member_price)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_appointment(uuid, uuid, uuid, timestamptz, text, text) from public;
grant execute on function public.create_appointment(uuid, uuid, uuid, timestamptz, text, text) to authenticated, service_role;

-- ---------- 2. 待确认预约超时回收 ----------
-- 现状：pending 计为时段占用（0003_functions.sql:86 与 0001:117-119），
-- 但全库没有任何回收逻辑 ⇒ 未处理的待确认单永久占位，且首页 pending 查询逐年变慢。
-- 已过开始时间 2 小时仍未处理的 pending 单归为 no_show，释放时段。
create or replace function public.expire_stale_pending_appointments()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.appointments
  set status = 'no_show'
  where status = 'pending'
    and start_time < now() - interval '2 hours';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.expire_stale_pending_appointments() from public;
grant execute on function public.expire_stale_pending_appointments() to service_role;

-- 每小时第 5 分钟跑一次；与既有的提醒/推送任务错峰
select cron.unschedule('expire-stale-pending')
where exists (select 1 from cron.job where jobname = 'expire-stale-pending');

select cron.schedule(
  'expire-stale-pending',
  '5 * * * *',
  $$select public.expire_stale_pending_appointments()$$
);

-- ---------- 3. Webhook 触发器收紧 + 密钥去硬编码 ----------
-- 现状：0008:36-38 的触发器是 after insert or update（无列清单），任何写都会排队一次
-- HTTP；且 0009:64-91 只替换了函数、没有重建触发器，所以无列清单的定义一直生效。
-- 头里的 'Bearer <SERVICE_ROLE_KEY>' 是占位符原文。两条链路受影响程度不同，
-- 这里按实测事实区分（我先前把两者都说成 401，是错的）：
--   · 0006 → send-reminder：函数自己比对密钥 ⇒ 占位符必然 401 ⇒ 每小时邮件提醒是死的。
--   · 0008/0009 → send-push：函数原本完全不校验 ⇒ 占位符照样执行 ⇒ 通知今天是在发的，
--     而同一个事实就是「任意匿名者也能调用它」这个漏洞本身。
-- 因此给 send-push 加守卫必须与「让触发器带上真凭据」同批上线，否则会把在用的功能打断。
-- 另外触发器原本无列清单（0009 只替换了函数、没有重建触发器），这里一并收紧。
create or replace function public.notify_appointment_push_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_url text;
  v_token text;
begin
  -- 只有这些列真的变了才通知（含状态跃迁与改期）
  if tg_op = 'UPDATE'
     and new.status = old.status
     and new.start_time = old.start_time
     and new.staff_id = old.staff_id
     and new.service_id = old.service_id
     and new.customer_id = old.customer_id
  then
    return new;
  end if;

-- 凭据来源：与 Edge Function 侧的 WEBHOOK_SERVICE_TOKEN 配套（见 functions/_shared/auth.ts）。
-- 故意不用 service_role —— 触发器只需要能调 send-push，不该在数据库里常驻一把
-- 能绕过全部 RLS 的万能钥匙。
-- 一次性配置：
--   supabase secrets set WEBHOOK_SERVICE_TOKEN='<随机长串>'
--   select vault.create_secret('<同一个随机长串>', 'webhook_service_token');
--     （或 alter database postgres set app.webhook_service_token = '<同一个随机长串>';）
--   alter database postgres set app.webhook_url =
--     'https://<project-ref>.supabase.co/functions/v1/send-push';
-- 读序：vault 优先 → 库级 GUC 兜底 → 都没有就不发（见下方 return new）。
  v_url := coalesce(nullif(current_setting('app.webhook_url', true), ''), '');
  v_token := coalesce(
    (select vs.decrypted_secret
       from vault.decrypted_secrets vs
      where vs.name = 'webhook_service_token'
      limit 1),
    nullif(current_setting('app.webhook_service_token', true), ''),
    ''
  );

  if v_token = '' or v_url = '' then
    -- 凭据或地址未配置就跳过：既不阻塞预约写入，也不发一个必然失败的请求
    return new;
  end if;

  v_payload := jsonb_build_object(
    'action', 'webhook_appointment',
    'type', tg_op,
    'record', row_to_json(new),
    'old_record', case when tg_op = 'UPDATE' then row_to_json(old) end
  );

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'Content-Type', 'application/json'
    ),
    body := v_payload
  );

  return new;
end;
$$;

drop trigger if exists trg_appointment_push_webhook on public.appointments;
create trigger trg_appointment_push_webhook
  after insert or update of status, start_time, staff_id, service_id, customer_id
  on public.appointments
  for each row execute function public.notify_appointment_push_webhook();
