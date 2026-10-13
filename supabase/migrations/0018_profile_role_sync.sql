-- ============================================================
-- 0018: 修复 profiles.role 与 user_roles 不一致
--
-- 设计意图（见 0001 建表注释）：user_roles 是角色的唯一权威来源，
-- profiles.role 只是「冗余展示字段」，供 UI 直接读取而无需联表。
--
-- 实测缺陷（线上核对）：admin@linzi.com 的 profiles.role='customer'，
-- 而 user_roles=['admin']；其余账号的 profiles.role 也一律停在 'customer'。
-- 即 handle_new_user() 建号时并未把角色写进 profiles —— 两表互相矛盾。
--
-- 目前不造成越权（所有判定走 has_role() → user_roles），但任何将来
-- 「顺手读 profiles.role」的功能都会把老板认成顾客，必须消除该分叉。
--
-- 实现要点：0002 的 guard_profile_update 会拦截「非老板改 role」，
-- 而角色同步是系统行为（无 auth.uid()），因此沿用 0005 余额守卫的做法，
-- 用事务级放行标记 app.allow_role_sync，既放行系统同步、又继续挡住越权用户。
-- ============================================================

-- ---------- 0. 让守卫认识「系统同步」这一情形 ----------
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id then
    raise exception '不允许修改用户标识';
  end if;

  if (new.role is distinct from old.role or new.store_id is distinct from old.store_id) then
    -- 系统同步（角色派生）与老板操作放行；其余一律拒绝
    if current_setting('app.allow_role_sync', true) = 'on' then
      return new;
    end if;
    if not public.has_role('admin') then
      raise exception '角色与门店归属仅能由老板修改';
    end if;
  end if;
  return new;
end;
$$;

-- ---------- 1. 角色优先级：admin > staff > customer ----------
create or replace function public.effective_role(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select ur.role
      from public.user_roles ur
      where ur.user_id = p_user_id
      order by case ur.role
        when 'admin' then 1
        when 'staff' then 2
        else 3
      end
      limit 1
    ),
    'customer'
  );
$$;

revoke execute on function public.effective_role(uuid) from public;
grant execute on function public.effective_role(uuid) to authenticated, service_role;

-- ---------- 2. profiles.role 单向跟随 user_roles ----------
create or replace function public.sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.allow_role_sync', 'on', true);
  update public.profiles
     set role = public.effective_role(new.user_id)
   where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_user_roles_sync_profile on public.user_roles;
create trigger trg_user_roles_sync_profile
  after insert or update or delete on public.user_roles
  for each row execute function public.sync_profile_role();

-- ---------- 3. 回填历史不一致 ----------
-- 回填是一次性系统操作，同样需要放行标记（顶层 SQL 无法 perform，
-- 故用 DO 块设置事务级 GUC）。
do $$
begin
  perform set_config('app.allow_role_sync', 'on', true);

  update public.profiles p
     set role = public.effective_role(p.id)
   where p.role is distinct from public.effective_role(p.id);
end $$;

-- ---------- 4. 建号触发器：只写权威表 + 由派生函数落 profiles ----------
-- 原实现把 app_metadata.role 双写到两张表，任一侧漂移都会造成矛盾。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_app_meta_data ->> 'role', 'customer');
begin
  if v_role not in ('admin', 'staff', 'customer') then
    v_role := 'customer';
  end if;

  perform set_config('app.allow_role_sync', 'on', true);

  insert into public.profiles (id, display_name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    new.email,
    new.raw_user_meta_data ->> 'phone',
    v_role
  );

  insert into public.user_roles (user_id, role) values (new.id, v_role);

  return new;
end;
$$;
