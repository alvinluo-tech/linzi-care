-- ============================================================
-- 0020: 门店时区去硬编码（可配置）
--
-- 背景：get_available_slots() 里写死了 `at time zone 'Asia/Shanghai'`。
-- 前端 src/lib/constants.ts 也硬编码同一个值。两处独立硬编码的时区是
-- 一类典型的「开到第二个时区才爆」的问题：时段列表、日营收分桶、周界
-- 计算全都锚定它，一旦要改，散落的字面量必然漏改，而漏改的表现是
-- 静默的整点偏移，不是报错。
--
-- 做法：把时区提到数据库级 GUC `app.store_timezone`，函数运行时读取，
-- 读不到再回落到 Asia/Shanghai。这样：
--   - 现有部署无需任何操作，行为完全不变（回落值与原来字面量一致）；
--   - 要改时区时，改一处即可：alter database postgres set app.store_timezone = '...';
--   - 与 app.webhook_url / app.webhook_service_token 的既有配置风格一致
--     （见 0011 与 0016），不引入新的配置机制。
--
-- 注意：本迁移不改变任何函数签名，PostgREST 无需重新学习重载；
-- 但仍建议跑一次 notify pgrst, 'reload schema' 以确保缓存一致。
-- ============================================================

create or replace function public.store_timezone()
returns text
language sql
stable
as $$
  -- 第二参数 true = 缺失时返回 null 而不是报错
  select coalesce(
    nullif(current_setting('app.store_timezone', true), ''),
    'Asia/Shanghai'
  );
$$;

comment on function public.store_timezone() is
  '门店营业时区（IANA）。由数据库级 GUC app.store_timezone 配置，默认 Asia/Shanghai。'
  '与前端 NEXT_PUBLIC_STORE_TIMEZONE 必须保持一致，否则前后端时段会错位。';

-- ---------- get_available_slots：改用可配置时区 ----------
-- 除时区来源外，逻辑与 0003 完全一致，避免顺手改出行为差异。
create or replace function public.get_available_slots(
  p_staff_id uuid,
  p_service_id uuid,
  p_date date
)
returns table (slot_start timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_duration int;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_step interval := interval '30 minutes';
  v_slot timestamptz;
  v_end timestamptz;
  v_tz text;
  s record;
begin
  select duration into v_duration from public.services where id = p_service_id and is_active;
  if not found then
    return;
  end if;

  if not exists (select 1 from public.staff where id = p_staff_id and is_active) then
    return;
  end if;

  v_tz := public.store_timezone();
  v_day_start := p_date::timestamp at time zone v_tz;
  v_day_end := v_day_start + interval '24 hours';

  for s in
    select * from public.schedules
    where staff_id = p_staff_id
      and start_time < v_day_end
      and end_time > v_day_start
    order by start_time
  loop
    v_slot := greatest(s.start_time, v_day_start);
    while v_slot + make_interval(mins => v_duration) <= least(s.end_time, v_day_end) loop
      v_end := v_slot + make_interval(mins => v_duration);
      if v_slot > now()
        and not exists (
          select 1 from public.appointments a
          where a.staff_id = p_staff_id
            and a.status not in ('cancelled', 'no_show')
            and tstzrange(a.start_time, a.end_time) && tstzrange(v_slot, v_end)
        )
      then
        slot_start := v_slot;
        return next;
      end if;
      v_slot := v_slot + v_step;
    end loop;
  end loop;
end;
$$;

grant execute on function public.get_available_slots(uuid, uuid, date) to anon, authenticated, service_role;
grant execute on function public.store_timezone() to anon, authenticated, service_role;

comment on function public.get_available_slots(uuid, uuid, date) is
  '某技师某服务在某天的可约时段（30 分钟步进）。日期边界按 public.store_timezone() 解释。';
