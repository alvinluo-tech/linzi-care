-- ============================================================
-- 预约邮件提醒：pg_cron + pg_net 定时调度
-- 使用方法：在 Supabase SQL Editor 中执行，替换下方两个尖括号占位符：
--   <PROJECT_REF>      Supabase 项目 Ref
--   <SERVICE_ROLE_KEY> service_role 密钥（Project Settings -> API）
-- 执行层 Edge Function：supabase/functions/send-reminder
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 重建调度（幂等）
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-appointment-reminders') then
    perform cron.unschedule('send-appointment-reminders');
  end if;
end $$;

-- 每小时触发一次 Edge Function，提醒未来 2 小时内开始的已确认预约
select cron.schedule(
  'send-appointment-reminders',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 每日心跳：防止免费项目因 7 天不活跃被暂停
do $$
begin
  if exists (select 1 from cron.job where jobname = 'keep-alive') then
    perform cron.unschedule('keep-alive');
  end if;
end $$;

select cron.schedule('keep-alive', '0 9 * * *', 'select 1;');
