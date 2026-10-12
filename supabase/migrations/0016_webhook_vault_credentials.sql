-- ============================================================
-- 0016: Webhook 凭据改走 vault（不再依赖库级 GUC）
--
-- 背景：0011 的触发器从 current_setting('app.webhook_url') 读地址、
-- 从 vault 或 GUC 读 token。但在 Supabase 托管库上，postgres 角色并非超级用户，
-- 无法执行 `alter database postgres set app.webhook_url = ...`（42501 权限不足），
-- 于是地址永远读不到 → 触发器静默跳过 → 老板收不到新预约通知。
--
-- 本迁移把地址也改为 vault 优先、GUC 兜底（与 token 读序一致），
-- 这样整套凭据都能用 vault.create_secret 配置，无需超级用户。
--
-- 配置方式（二选一，均已可用）：
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push',
--                              'webhook_url');
--   select vault.create_secret('<随机长串>', 'webhook_service_token');
-- 或（若能以超级用户连接）继续用 app.webhook_url / app.webhook_service_token。
-- ============================================================

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

  -- 地址：vault 优先 → 库级 GUC 兜底
  v_url := coalesce(
    (select vs.decrypted_secret
       from vault.decrypted_secrets vs
      where vs.name = 'webhook_url'
      limit 1),
    nullif(current_setting('app.webhook_url', true), ''),
    ''
  );

  -- 令牌：vault 优先 → 库级 GUC 兜底
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
