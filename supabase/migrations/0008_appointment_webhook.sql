-- ============================================================
-- 0008: Database Webhook 触发器 (appointments 变动触发 send-push 通知老板与员工)
-- ============================================================

create or replace function public.notify_appointment_push_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  -- 组装通知载荷
  v_payload := jsonb_build_object(
    'action', 'webhook_appointment',
    'type', tg_op,
    'record', row_to_json(new)
  );

  -- 通过 pg_net 异步 HTTP POST 发送到 send-push Edge Function
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

drop trigger if exists trg_appointment_push_webhook on public.appointments;
create trigger trg_appointment_push_webhook
  after insert or update on public.appointments
  for each row execute function public.notify_appointment_push_webhook();
