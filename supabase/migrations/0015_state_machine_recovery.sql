-- ============================================================
-- 0015: 状态机可恢复性 + 结算函数权限（配合 0011–0013）
--
-- 两个问题：
-- 1) 0011 的 expire_stale_pending_appointments 会把「开始时间已过 2 小时仍未处理」的
--    pending 单自动改为 no_show，而 0009 的状态机不允许 no_show 再流转。
--    一旦顾客实际到店、只是老板未及时点确认，这单就永久卡死且钱已被自动退回 ——
--    门店白做一次服务。这里给老板（仅老板）开一条恢复通道：
--    no_show → confirmed / done / arrived 由老板按实际履约情况修正。
-- 2) 结算原语 (release_appointment_payment / consume_appointment_pass) 在 0012 中
--    revoke 了 public，但触发器以 definer 身份调用不受影响；这里显式确认
--    service_role 也不可直呼，避免被当作提款接口。
-- ============================================================

create or replace function public.update_appointment_status(
  p_appointment_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.appointments%rowtype;
  v_allowed boolean := false;
begin
  if p_status not in ('pending', 'confirmed', 'arrived', 'done', 'cancelled', 'no_show') then
    raise exception '无效的预约状态';
  end if;

  select * into v from public.appointments where id = p_appointment_id;
  if not found then
    raise exception '预约不存在';
  end if;

  if public.has_role('admin') then
    -- 老板：全权流转，但必须遵循状态机，防止乱序（如 done → pending）
    v_allowed := case
      when v.status = 'pending'   and p_status in ('confirmed', 'cancelled') then true
      when v.status = 'confirmed' and p_status in ('arrived', 'done', 'no_show', 'cancelled') then true
      when v.status = 'arrived'   and p_status in ('done', 'no_show', 'cancelled') then true
      -- 恢复通道：自动作废(no_show)但实际已履约的单，老板可纠正为真实结果。
      -- 只允许前进到 confirmed/arrived/done，不允许退回 pending（那是新建语义）。
      when v.status = 'no_show'   and p_status in ('confirmed', 'arrived', 'done') then true
      else false
    end;
    if not v_allowed then
      raise exception '不允许的状态流转：% → %', v.status, p_status;
    end if;
  elsif public.current_staff_id() is not null and v.staff_id = public.current_staff_id() then
    -- 技师：仅可对自己的客单打点（到店 / 完成 / 未到店），不可确认接单或取消
    if p_status not in ('arrived', 'done', 'no_show') then
      raise exception '技师仅可执行「到店 / 完成 / 未到店」操作，确认与取消请联系老板';
    end if;
    v_allowed := case
      when v.status = 'confirmed' and p_status in ('arrived', 'done', 'no_show') then true
      when v.status = 'arrived'   and p_status in ('done', 'no_show') then true
      else false
    end;
    if not v_allowed then
      raise exception '不允许的状态流转：% → %', v.status, p_status;
    end if;
  else
    raise exception '权限不足：仅老板或该单技师可操作';
  end if;

  update public.appointments set status = p_status where id = p_appointment_id;
end;
$$;

revoke execute on function public.update_appointment_status(uuid, text) from public;
grant execute on function public.update_appointment_status(uuid, text) to authenticated, service_role;
