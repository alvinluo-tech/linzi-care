-- ============================================================
-- 0010: 员工端顾客可见性修复
-- 问题：members 表 RLS 仅允许顾客读本人、老板读全部，导致技师在
-- 「待履约客单」中看不到顾客姓名与电话（显示为 —），无法接待。
-- 方案：安全定义函数按「分配给自己的预约」返回最小必要字段
-- （姓名/电话/项目/时间/状态/备注），不暴露余额等敏感列。
-- ============================================================

create or replace function public.my_guest_appointments()
returns table (
  appointment_id uuid,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  remark text,
  service_name text,
  service_duration int,
  member_name text,
  member_phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.start_time,
    a.end_time,
    a.status,
    a.remark,
    s.name,
    s.duration,
    m.name,
    m.phone
  from public.appointments a
  join public.services s on s.id = a.service_id
  join public.members m on m.id = a.customer_id
  where a.staff_id = (select id from public.staff where user_id = auth.uid())
  order by a.start_time desc
  limit 200;
$$;

revoke execute on function public.my_guest_appointments() from public, anon;
grant execute on function public.my_guest_appointments() to authenticated, service_role;
