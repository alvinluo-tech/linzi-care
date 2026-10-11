-- ============================================================
-- 0009: 预约确认流程强化
-- 1. update_appointment_status 加入状态机硬约束（⑤）
-- 2. 技师可对自己的客单执行「到店 / 完成 / 未到店」打点（②）
-- 3. Webhook 载荷携带 old_record，供 send-push 识别「待确认→已确认」流转（①）
-- ============================================================

-- 1+2. 状态机 + 角色分级流转（安全定义函数，绕过 RLS，函数内部自鉴权）
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

-- 3. Webhook 触发器载荷补充 old_record（send-push 据此识别 pending→confirmed 流转，闭环通知顾客）
create or replace function public.notify_appointment_push_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'action', 'webhook_appointment',
    'type', tg_op,
    'record', row_to_json(new),
    'old_record', case when tg_op = 'UPDATE' then row_to_json(old) end
  );

  perform net.http_post(
    url := 'https://bzjsbiafxxgljbdcreqf.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := v_payload
  );

  return new;
end;
$$;
