-- ============================================================
-- 0003: 核心 Postgres 函数（事务 + 权限自校验）
-- ============================================================

-- ---------- 创建预约（防冲突事务函数） ----------
-- 顾客只能为自己预约；老板可代任意会员预约；
-- 校验：服务/技师有效、技师提供该项目、时间在未来、时间落在排班内、技师无时间重叠。
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

  -- 只有老板能直接创建“已确认”的预约，顾客创建的一律进入待确认
  v_status := case when public.has_role('admin') then p_status else 'pending' end;

  -- 顾客只能为自己预约
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

  -- 同一技师串行化，避免并发预约同时通过重叠检查
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
    (store_id, customer_id, staff_id, service_id, start_time, end_time, status, remark)
  values
    (coalesce(v_staff.store_id, v_service.store_id),
     p_customer_id, p_staff_id, p_service_id,
     p_start_time, v_end_time, v_status, nullif(p_remark, ''))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------- 取消预约 ----------
-- 会员可取消自己的预约，老板可取消任意预约；仅待确认/已确认状态可取消。
create or replace function public.cancel_appointment(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.appointments%rowtype;
begin
  select * into v from public.appointments where id = p_appointment_id;
  if not found then
    raise exception '预约不存在';
  end if;

  if not public.has_role('admin') then
    if v.customer_id is distinct from public.current_member_id() then
      raise exception '无权取消该预约';
    end if;
  end if;

  if v.status not in ('pending', 'confirmed') then
    raise exception '当前状态 % 不可取消', v.status;
  end if;

  update public.appointments set status = 'cancelled' where id = p_appointment_id;
end;
$$;

-- ---------- 更新预约状态（仅老板） ----------
create or replace function public.update_appointment_status(
  p_appointment_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception '权限不足：仅老板可操作';
  end if;

  if p_status not in ('pending', 'confirmed', 'arrived', 'done', 'cancelled', 'no_show') then
    raise exception '无效的预约状态';
  end if;

  update public.appointments set status = p_status where id = p_appointment_id;
  if not found then
    raise exception '预约不存在';
  end if;
end;
$$;

-- ---------- 老板调整会员余额（唯一入口，先取旧值再更新，全量审计） ----------
create or replace function public.admin_update_balance(
  p_member_id uuid,
  p_new_balance numeric,
  p_reason text default '老板手动调整'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old numeric(12, 2);
begin
  if not public.has_role('admin') then
    raise exception '权限不足：仅老板可调整余额';
  end if;

  if p_new_balance < 0 then
    raise exception '余额不能为负数';
  end if;

  select balance into v_old from public.members where id = p_member_id for update;
  if not found then
    raise exception '会员不存在';
  end if;

  update public.members set balance = p_new_balance where id = p_member_id;

  insert into public.balance_logs (member_id, old_balance, new_balance, reason, operator_id)
  values (p_member_id, v_old, p_new_balance, coalesce(nullif(p_reason, ''), '老板手动调整'), auth.uid());
end;
$$;

-- ---------- 查询某技师某服务在某天的可约时段（东八区，30 分钟步进） ----------
create or replace function public.get_available_slots(
  p_staff_id uuid,
  p_service_id uuid,
  p_date date
)
returns table (slot_start timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_duration int;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_step interval := interval '30 minutes';
  v_slot timestamptz;
  v_end timestamptz;
  s record;
begin
  select duration into v_duration from public.services where id = p_service_id and is_active;
  if not found then
    return;
  end if;

  if not exists (select 1 from public.staff where id = p_staff_id and is_active) then
    return;
  end if;

  v_day_start := p_date::timestamp at time zone 'Asia/Shanghai';
  v_day_end := v_day_start + interval '24 hours';

  for s in
    select * from public.schedules
    where staff_id = p_staff_id
      and start_time < v_day_end
      and end_time > v_day_start
    order by start_time
  loop
    v_slot := greatest(s.start_time, v_day_start);
    while v_slot + make_interval(mins => v_duration) <= least(s.end_time, v_day_end) loop
      v_end := v_slot + make_interval(mins => v_duration);
      if v_slot > now()
        and not exists (
          select 1 from public.appointments a
          where a.staff_id = p_staff_id
            and a.status not in ('cancelled', 'no_show')
            and tstzrange(a.start_time, a.end_time) && tstzrange(v_slot, v_end)
        )
      then
        slot_start := v_slot;
        return next;
      end if;
      v_slot := v_slot + v_step;
    end loop;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- RPC 执行权限收紧（函数在本文件创建，故授权集中放在此处）
-- 函数内部均自鉴权，这里仅收回匿名调用面
-- ------------------------------------------------------------
revoke execute on function public.create_appointment(uuid, uuid, uuid, timestamptz, text, text) from public;
grant execute on function public.create_appointment(uuid, uuid, uuid, timestamptz, text, text) to authenticated, service_role;

revoke execute on function public.cancel_appointment(uuid) from public;
grant execute on function public.cancel_appointment(uuid) to authenticated, service_role;

revoke execute on function public.update_appointment_status(uuid, text) from public;
grant execute on function public.update_appointment_status(uuid, text) to authenticated, service_role;

revoke execute on function public.admin_update_balance(uuid, numeric, text) from public;
grant execute on function public.admin_update_balance(uuid, numeric, text) to authenticated, service_role;

-- get_available_slots 保持公开（浏览可约时段无需登录，函数内部只返回空档时间）
grant execute on function public.get_available_slots(uuid, uuid, date) to anon, authenticated, service_role;
