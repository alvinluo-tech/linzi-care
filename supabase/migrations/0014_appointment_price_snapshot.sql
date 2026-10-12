-- ============================================================
-- 0014: 预约成交价快照（报表口径固化）
--
-- 背景：报表营收原先按 services 的「当前」price 回算每一条 done 单
-- （src/app/admin/reports/page.tsx），于是改价会追溯改写历史营收，
-- 且用的是门市价而非会员实际支付的会员价 —— 两个方向都会算错钱。
--
-- 本迁移只做「加列 + 回填」，不重定义 create_appointment：
-- 函数体由 0011（6 参）与 0012（7 参，并 drop 6 参）负责，二者紧随其后。
-- 若在此处再定义一次 create_appointment，一旦与 0012 的 7 参版本并存，
-- PostgREST 会因重载无法消歧而报 "Could not choose the best candidate"，
-- 整个预约功能当场失效。故此处刻意不含函数定义。
-- 两处（0011/0014）都用 add column if not exists，谁先跑都安全。
--
-- 回填口径：历史单只能按「当前价」近似（当时真实成交价已不可考），
-- 因此回填值可能与实际成交价有偏差；上线后新单均为精确快照。
-- ============================================================

alter table public.appointments
  add column if not exists price_snapshot numeric(12, 2),
  add column if not exists member_price_snapshot numeric(12, 2);

comment on column public.appointments.price_snapshot is
  '创建预约时的服务门市价快照；报表营收以此为准，不随 services.price 调整而变化';
comment on column public.appointments.member_price_snapshot is
  '创建预约时的会员价快照（会员实际支付口径，优先于门市价）';

-- 历史回填：仅补空值，绝不覆盖已有快照（保证可重复执行）
update public.appointments a
set price_snapshot = s.price,
    member_price_snapshot = s.member_price
from public.services s
where a.service_id = s.id
  and a.price_snapshot is null;
