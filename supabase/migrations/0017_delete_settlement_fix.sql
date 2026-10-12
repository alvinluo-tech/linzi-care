-- ============================================================
-- 0017: 修正删除结算 —— 已履约的单删除时不应退款
--
-- 0012 的 settle_appointment_delete 只排除了 legacy/refunded，
-- 于是删除一张「已完成」的预约会把它已消费的钱退还给会员 —— 凭空造钱。
-- 一条已完成的服务，其款项是收入；删除历史记录不应产生退款。
--
-- 正确口径：只有 charged（钱占着、服务未完成）在删除时退款；
-- completed / redeemed（已完成）与 legacy / refunded 一律不动。
-- ============================================================

create or replace function public.settle_appointment_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 只有「已扣但未结算」的单在删除时才该退款：
  --   charged  = 钱占着、服务没做成 → 退
  --   completed/redeemed = 服务已完成，钱是消费掉的 → 不退（删记录只是删记录）
  --   legacy/refunded   = 本就没扣过 / 已退过 → 不动
  if old.payment_state in ('legacy', 'refunded', 'completed', 'redeemed') then
    return old;
  end if;

  -- 券退回
  if old.pass_id is not null then
    update public.service_passes set status = 'active'
     where id = old.pass_id and status = 'held';
    if found then
      insert into public.pass_ledger
        (pass_id, member_id, old_status, new_status, reason, operator_id)
      select old.pass_id, p.member_id, 'held', 'active', '预约删除退回', auth.uid()
        from public.service_passes p where p.id = old.pass_id;
    end if;
  end if;

  -- 余额退回（仅当本单确实扣过款且尚无 booking_refund）
  if old.charged_amount > 0 and not exists (
    select 1 from public.balance_logs bl
    where bl.appointment_id = old.id and bl.entry_kind = 'booking_refund'
  ) then
    declare
      v_old numeric;
    begin
      select balance into v_old from public.members where id = old.customer_id for update;
      if found then
        perform set_config('app.allow_balance_update', 'on', true);
        update public.members set balance = v_old + old.charged_amount
         where id = old.customer_id;
        insert into public.balance_logs
          (member_id, old_balance, new_balance, reason, operator_id, appointment_id, entry_kind)
        values
          (old.customer_id, v_old, v_old + old.charged_amount,
           '预约删除退回 ¥' || trim(to_char(old.charged_amount, '9999999990.99')),
           auth.uid(), old.id, 'booking_refund');
      end if;
    end;
  end if;
  return old;
end;
$$;
