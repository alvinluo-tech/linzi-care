-- ============================================================
-- 0001: 核心表结构
-- 林梓精养馆 · 梓养云（单店 MVP，预留 store_id 多店扩展）
-- ============================================================

-- 门店
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  created_at timestamptz not null default now()
);

-- 用户档案（扩展 auth.users，角色为冗余展示字段，权威来源是 user_roles）
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  phone text,
  role text not null default 'customer' check (role in ('admin', 'staff', 'customer')),
  store_id uuid references public.stores(id),
  created_at timestamptz not null default now()
);

-- 角色表（RLS 权威来源）
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'staff', 'customer')),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
create index user_roles_user_id_idx on public.user_roles(user_id);

-- 会员（balance 为纯服务端权威字段，前端只能读，更新走 admin_update_balance RPC）
create table public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  balance numeric(12, 2) not null default 0 check (balance >= 0),
  store_id uuid references public.stores(id),
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create index members_user_id_idx on public.members(user_id);

-- 员工/技师（联系电话与邮箱存于 profiles，技师公开页只展示姓名/头衔/简介）
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  title text,
  bio text,
  avatar_url text,
  store_id uuid references public.stores(id),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 服务项目
create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  duration int not null default 60 check (duration > 0),
  price numeric(10, 2) not null check (price >= 0),
  member_price numeric(10, 2) check (member_price >= 0),
  image_url text,
  category text,
  store_id uuid references public.stores(id),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 技师-服务 关联（预约时校验技师是否提供该项目）
create table public.staff_services (
  staff_id uuid not null references public.staff(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (staff_id, service_id)
);

-- 排班（技师可接单的时间段）
create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  note text,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index schedules_staff_time_idx on public.schedules(staff_id, start_time);

-- 预约
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  customer_id uuid not null references public.members(id),
  staff_id uuid not null references public.staff(id),
  service_id uuid not null references public.services(id),
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'arrived', 'done', 'cancelled', 'no_show')),
  remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);
-- 防冲突：同一技师同一开始时间只允许一条有效预约（已取消/爽约不占位）
create unique index appointments_staff_start_active_idx
  on public.appointments(staff_id, start_time)
  where status not in ('cancelled', 'no_show');
create index appointments_staff_range_idx on public.appointments(staff_id, start_time, end_time);
create index appointments_customer_idx on public.appointments(customer_id, start_time desc);
create index appointments_status_time_idx on public.appointments(status, start_time);

-- 商城（纯展示）
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(10, 2) not null check (price >= 0),
  image_url text,
  category_id uuid references public.product_categories(id) on delete set null,
  stock_status text not null default 'in_stock'
    check (stock_status in ('in_stock', 'low_stock', 'out_of_stock')),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 余额审计（只能通过 admin_update_balance 写入）
create table public.balance_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  old_balance numeric(12, 2) not null,
  new_balance numeric(12, 2) not null,
  delta numeric(12, 2) generated always as (new_balance - old_balance) stored,
  reason text not null default '老板手动调整',
  operator_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index balance_logs_member_idx on public.balance_logs(member_id, created_at desc);

-- 通知记录（提醒去重依据）
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete cascade,
  type text not null default 'reminder',
  channel text not null default 'email',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_appointment_idx on public.notifications(appointment_id, type);

-- ------------------------------------------------------------
-- 触发器
-- ------------------------------------------------------------

-- appointments.updated_at 自动维护
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- 新认证用户自动建档（profiles + user_roles），角色取自 app_metadata.role
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- Realtime：管理端订阅预约表变更
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.appointments;
