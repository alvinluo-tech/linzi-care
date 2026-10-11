-- ============================================================
-- 0002: RLS 行级安全策略
-- 角色三种：admin（老板）/ staff（员工）/ customer（会员）
-- 权威来源：public.user_roles；数据库层兜底，前端漏洞无法越权
-- ============================================================

-- ---------- 权限辅助函数（security definer，避免 RLS 递归） ----------
create or replace function public.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = p_role
  );
$$;

create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.members where user_id = auth.uid() limit 1;
$$;

create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.staff where user_id = auth.uid() limit 1;
$$;

-- ---------- 启用 RLS ----------
alter table public.stores             enable row level security;
alter table public.profiles           enable row level security;
alter table public.user_roles         enable row level security;
alter table public.members            enable row level security;
alter table public.staff              enable row level security;
alter table public.services           enable row level security;
alter table public.staff_services     enable row level security;
alter table public.schedules          enable row level security;
alter table public.appointments       enable row level security;
alter table public.product_categories enable row level security;
alter table public.products           enable row level security;
alter table public.balance_logs       enable row level security;
alter table public.notifications      enable row level security;

-- ---------- stores：门店信息公开可读，仅老板可改 ----------
create policy "stores_select_public" on public.stores
  for select to anon, authenticated using (true);

create policy "stores_admin_update" on public.stores
  for update to authenticated using (public.has_role('admin'));

-- ---------- profiles：本人与管理员可见，本人可改基本资料 ----------
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.has_role('admin'));

create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.has_role('admin'))
  with check (id = auth.uid() or public.has_role('admin'));

create policy "profiles_admin_delete" on public.profiles
  for delete to authenticated using (public.has_role('admin'));

-- 第二道防线：普通用户不能改自己的角色/门店归属
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
  if (new.role is distinct from old.role or new.store_id is distinct from old.store_id)
     and not public.has_role('admin') then
    raise exception '角色与门店归属仅能由老板修改';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------- user_roles：本人与管理员可读；写入仅走 service_role（建号函数） ----------
create policy "user_roles_select_own_or_admin" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));

-- ---------- members：本人与管理员可见；balance 列收回，只能走 RPC ----------
create policy "members_select_own_or_admin" on public.members
  for select to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));

create policy "members_update_own_or_admin" on public.members
  for update to authenticated
  using (user_id = auth.uid() or public.has_role('admin'))
  with check (user_id = auth.uid() or public.has_role('admin'));

create policy "members_admin_delete" on public.members
  for delete to authenticated using (public.has_role('admin'));

-- 核心原则：余额是纯服务端权威字段，任何认证用户（含老板）都不能直接 UPDATE
revoke update (balance) on public.members from authenticated;

-- ---------- staff：技师公开资料全员可读；手机号/邮箱不在本表 ----------
create policy "staff_select_public" on public.staff
  for select to anon, authenticated using (true);

create policy "staff_admin_update" on public.staff
  for update to authenticated using (public.has_role('admin'));

create policy "staff_admin_delete" on public.staff
  for delete to authenticated using (public.has_role('admin'));

-- ---------- services：在售项目公开可读；管理仅老板 ----------
create policy "services_select_public_or_admin" on public.services
  for select to anon, authenticated
  using (is_active or public.has_role('admin'));

create policy "services_admin_insert" on public.services
  for insert to authenticated with check (public.has_role('admin'));

create policy "services_admin_update" on public.services
  for update to authenticated using (public.has_role('admin'));

create policy "services_admin_delete" on public.services
  for delete to authenticated using (public.has_role('admin'));

-- ---------- staff_services：技师可接项目，公开可读 ----------
create policy "staff_services_select_public" on public.staff_services
  for select to anon, authenticated using (true);

create policy "staff_services_admin_insert" on public.staff_services
  for insert to authenticated with check (public.has_role('admin'));

create policy "staff_services_admin_delete" on public.staff_services
  for delete to authenticated using (public.has_role('admin'));

-- ---------- schedules：老板全权；技师只读自己的排班 ----------
create policy "schedules_select_admin_or_own" on public.schedules
  for select to authenticated
  using (
    public.has_role('admin')
    or staff_id = public.current_staff_id()
  );

create policy "schedules_admin_insert" on public.schedules
  for insert to authenticated with check (public.has_role('admin'));

create policy "schedules_admin_update" on public.schedules
  for update to authenticated using (public.has_role('admin'));

create policy "schedules_admin_delete" on public.schedules
  for delete to authenticated using (public.has_role('admin'));

-- ---------- appointments：老板全权；会员/技师只能看与自己相关的 ----------
create policy "appointments_select_scoped" on public.appointments
  for select to authenticated
  using (
    public.has_role('admin')
    or customer_id = public.current_member_id()
    or staff_id = public.current_staff_id()
  );

create policy "appointments_admin_update" on public.appointments
  for update to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

create policy "appointments_admin_delete" on public.appointments
  for delete to authenticated using (public.has_role('admin'));

-- insert 不设策略：预约创建统一走 create_appointment() RPC（防冲突 + 身份校验）

-- ---------- product_categories / products：在售商品公开可读 ----------
create policy "product_categories_select_public" on public.product_categories
  for select to anon, authenticated using (true);

create policy "product_categories_admin_insert" on public.product_categories
  for insert to authenticated with check (public.has_role('admin'));

create policy "product_categories_admin_update" on public.product_categories
  for update to authenticated using (public.has_role('admin'));

create policy "product_categories_admin_delete" on public.product_categories
  for delete to authenticated using (public.has_role('admin'));

create policy "products_select_public_or_admin" on public.products
  for select to anon, authenticated
  using (is_active or public.has_role('admin'));

create policy "products_admin_insert" on public.products
  for insert to authenticated with check (public.has_role('admin'));

create policy "products_admin_update" on public.products
  for update to authenticated using (public.has_role('admin'));

create policy "products_admin_delete" on public.products
  for delete to authenticated using (public.has_role('admin'));

-- ---------- balance_logs：本人与管理员可读；写入仅通过 RPC ----------
create policy "balance_logs_select_own_or_admin" on public.balance_logs
  for select to authenticated
  using (
    public.has_role('admin')
    or member_id = public.current_member_id()
  );

-- ---------- notifications：仅老板可读；写入走 service_role ----------
create policy "notifications_admin_select" on public.notifications
  for select to authenticated using (public.has_role('admin'));

-- has_role 供策略调用，保持默认 PUBLIC 可执行即可
grant execute on function public.has_role(text) to anon, authenticated, service_role;
