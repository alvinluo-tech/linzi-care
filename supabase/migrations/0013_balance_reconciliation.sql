-- ============================================================
-- 0013: 余额对账视图（只读，仅老板）
--
-- 适用时机：仅在「启用 0012 的预约扣款之前，库里已经存在真实充值与真实消费」时才需要。
-- 那种情形下 members.balance 等于「累计充值额」而非「剩余信用」，直接开始扣款会让会员
-- 把同一笔钱再花一遍，必须先估算并人工核减。
--
-- 当前状态（2026-10-12 老板确认）：库里全部是测试数据、尚无真实顾客，因此**不需要**跑
-- 本视图做估算校正——更干净的做法是上线前清空测试会员与其预约/账本，从真实余额开始记账。
-- 保留本函数的理由是它在上线之后仍然有用：定期审计账面余额与已履约额的差额。
--
-- 估算口径（务必知道它是下限而非精确账）：
--   · 只统计 status='done' 且 payment_state='legacy' 的旧单（0012 把历史单一律标 legacy）
--   · 单价取 coalesce(member_price_snapshot, services.member_price,
--                    price_snapshot, services.price)
--     其中快照列由 0011 回填，回填用的是「当时」的价格，所以价格改过的必然偏差
--   · arrived / pending / confirmed 不计入（尚未履约）
-- 核减动作走现有「手动调整余额」，会自动写 balance_logs 留痕，不新增任何写入路径。
-- ============================================================

create or replace function public.admin_balance_reconciliation()
returns table (
  member_id uuid,
  member_name text,
  member_active boolean,
  current_balance numeric,
  topped_up numeric,
  manual_decrease numeric,
  booked_charged numeric,
  unbilled_done_count bigint,
  unbilled_done_value numeric,
  suggested_balance numeric,
  adjust_by numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception '权限不足：仅老板可查看余额对账';
  end if;

  return query
  with unbilled as (
    select
      a.customer_id,
      count(*) as done_count,
      coalesce(sum(
        coalesce(
          a.member_price_snapshot,
          s.member_price,
          a.price_snapshot,
          s.price,
          0
        )
      ), 0) as done_value
    from public.appointments a
    left join public.services s on s.id = a.service_id
    where a.status = 'done'
      and a.payment_state = 'legacy'
    group by a.customer_id
  ),
  ledger as (
    select
      bl.member_id,
      -- 真实充值 = 正 delta 且不是预约退款（0012 起退款带 entry_kind='booking_refund'）。
      -- 原写法只按 delta>0 统计，会把「取消预约退回」也算成充值，虚增累计充值额。
      coalesce(sum(case
        when bl.delta > 0 and coalesce(bl.entry_kind, 'manual') <> 'booking_refund'
        then bl.delta end), 0) as topped_up,
      -- 手动核减 = 负 delta 且不是预约扣费（结构化判定，不再靠 reason 前缀）
      coalesce(sum(case
        when bl.delta < 0 and coalesce(bl.entry_kind, 'manual') <> 'booking_charge'
        then -bl.delta end), 0) as manual_decrease,
      coalesce(sum(case
        when bl.entry_kind = 'booking_charge'
        then -bl.delta end), 0) as booked_charged
    from public.balance_logs bl
    group by bl.member_id
  )
  select
    m.id,
    m.name,
    m.is_active,
    m.balance,
    coalesce(l.topped_up, 0),
    coalesce(l.manual_decrease, 0),
    coalesce(l.booked_charged, 0),
    coalesce(u.done_count, 0),
    coalesce(u.done_value, 0),
    greatest(m.balance - coalesce(u.done_value, 0), 0),
    -- 需要下调的金额：账面虚高部分，但不超过现有余额（不会把余额压成负数）
    least(coalesce(u.done_value, 0), m.balance)
  from public.members m
  left join ledger l on l.member_id = m.id
  left join unbilled u on u.customer_id = m.id
  order by least(coalesce(u.done_value, 0), m.balance) desc, m.name;
end;
$$;

-- 汇总一行，便于老板一眼看清整体敞口（而不是自己去加几百行）
create or replace function public.admin_balance_reconciliation_totals()
returns table (
  members_count bigint,
  members_overstated bigint,
  balance_sum numeric,
  topped_up_sum numeric,
  unbilled_done_value_sum numeric,
  suggested_balance_sum numeric,
  adjust_sum numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception '权限不足：仅老板可查看余额对账';
  end if;

  return query
  select
    count(*),
    count(*) filter (where r.adjust_by > 0),
    coalesce(sum(r.current_balance), 0),
    coalesce(sum(r.topped_up), 0),
    coalesce(sum(r.unbilled_done_value), 0),
    coalesce(sum(r.suggested_balance), 0),
    coalesce(sum(r.adjust_by), 0)
  from public.admin_balance_reconciliation() r;
end;
$$;

revoke execute on function public.admin_balance_reconciliation() from public;
grant execute on function public.admin_balance_reconciliation() to authenticated, service_role;
revoke execute on function public.admin_balance_reconciliation_totals() from public;
grant execute on function public.admin_balance_reconciliation_totals() to authenticated, service_role;
