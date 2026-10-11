-- ============================================================
-- 0005: 强化余额服务端权威与防止并发冲突
-- 1. members_guard_balance 触发器：彻底阻断任何直接 UPDATE balance 的行为，仅允许 admin_update_balance 函数内部修改
-- 2. 只有当前会话拥有 app.allow_balance_update 事务局部变量时才放行
-- ============================================================

create or replace function public.guard_member_balance_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.balance is distinct from old.balance then
    if current_setting('app.allow_balance_update', true) is distinct from 'on' then
      raise exception '安全策略：会员余额是纯服务端权威字段，禁止直接修改，必须通过 admin_update_balance RPC 函数变更！';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_member_balance on public.members;
create trigger trg_guard_member_balance
  before update on public.members
  for each row execute function public.guard_member_balance_update();

-- 更新 admin_update_balance 函数，设置事务开关放行
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

  -- 开启本事务放行标记
  perform set_config('app.allow_balance_update', 'on', true);

  update public.members set balance = p_new_balance where id = p_member_id;

  insert into public.balance_logs (member_id, old_balance, new_balance, reason, operator_id)
  values (p_member_id, v_old, p_new_balance, coalesce(nullif(p_reason, ''), '老板手动调整'), auth.uid());
end;
$$;
