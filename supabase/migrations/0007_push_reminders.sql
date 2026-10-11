-- ============================================================
-- 0007: PWA 推送通知、定时提醒队列表与 Webhook 调度
-- ============================================================

-- 1. PWA 推送订阅表 (push_subscriptions)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- RLS 策略：用户仅能管理自己的推送订阅，老板可查看全部
drop policy if exists "push_subscriptions_select" on public.push_subscriptions;
create policy "push_subscriptions_select" on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));

drop policy if exists "push_subscriptions_insert" on public.push_subscriptions;
create policy "push_subscriptions_insert" on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_update" on public.push_subscriptions;
create policy "push_subscriptions_update" on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid() or public.has_role('admin'))
  with check (user_id = auth.uid() or public.has_role('admin'));

drop policy if exists "push_subscriptions_delete" on public.push_subscriptions;
create policy "push_subscriptions_delete" on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));

-- 2. 预约提醒队列表 (reminders)
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id)
);

create index if not exists reminders_pending_send_at_idx
  on public.reminders(send_at)
  where status = 'pending';

alter table public.reminders enable row level security;

drop policy if exists "reminders_admin_only" on public.reminders;
create policy "reminders_admin_only" on public.reminders
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- 3. 自动入队触发器：预约创建/确认时，自动生成提前 2 小时的提醒计划；已取消/未到店时自动取消
create or replace function public.handle_appointment_reminder_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_send_at timestamptz;
begin
  if new.status in ('confirmed', 'pending') then
    -- 预约开始前 2 小时提醒；若预约就在 2 小时内，则立即提醒 (now())
    v_send_at := greatest(new.start_time - interval '2 hours', now());
    insert into public.reminders (appointment_id, send_at, status)
    values (new.id, v_send_at, 'pending')
    on conflict (appointment_id) do update
      set send_at = excluded.send_at,
          status = case when public.reminders.status = 'sent' then 'sent' else 'pending' end,
          updated_at = now();
  elsif new.status in ('cancelled', 'no_show') then
    update public.reminders
    set status = 'cancelled', updated_at = now()
    where appointment_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_appointment_reminder_schedule on public.appointments;
create trigger trg_appointment_reminder_schedule
  after insert or update of status, start_time on public.appointments
  for each row execute function public.handle_appointment_reminder_schedule();

-- 补齐现有已确认预约的提醒记录
insert into public.reminders (appointment_id, send_at, status)
select id, greatest(start_time - interval '2 hours', now()), 'pending'
from public.appointments
where status in ('pending', 'confirmed')
on conflict (appointment_id) do nothing;

-- 4. 调整 pg_cron：每 5 分钟由 pg_net 触发 send-push 函数处理到期提醒
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-appointment-reminders') then
    perform cron.unschedule('send-appointment-reminders');
  end if;
  if exists (select 1 from cron.job where jobname = 'process-scheduled-reminders') then
    perform cron.unschedule('process-scheduled-reminders');
  end if;
end $$;

select cron.schedule(
  'process-scheduled-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://bzjsbiafxxgljbdcreqf.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('action', 'process_reminders')
  );
  $$
);
