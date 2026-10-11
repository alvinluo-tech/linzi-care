-- ============================================================
-- 0006: 启用 pg_cron + pg_net 定时提醒与防休眠任务
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 重建 send-appointment-reminders 调度（幂等）
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-appointment-reminders') then
    perform cron.unschedule('send-appointment-reminders');
  end if;
end $$;

-- 每小时整点触发 send-reminder Edge Function
select cron.schedule(
  'send-appointment-reminders',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://bzjsbiafxxgljbdcreqf.supabase.co/functions/v1/send-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 重建 keep-alive 调度（每天早9点心跳，防免费套餐7天不活跃休眠）
do $$
begin
  if exists (select 1 from cron.job where jobname = 'keep-alive') then
    perform cron.unschedule('keep-alive');
  end if;
end $$;

select cron.schedule('keep-alive', '0 9 * * *', 'select 1;');
