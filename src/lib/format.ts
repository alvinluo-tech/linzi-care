import { combineStoreDateTime, STORE_TIMEZONE } from "@/lib/constants";

// format.ts 是日期/时刻的门面：调用方不应为了拼一个东八区时间再去 import constants
export { combineStoreDateTime };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 第一性原理：这家店只有一个营业时区（Asia/Shanghai），而预约时刻在库里是 UTC timestamptz。
 * 若用访客浏览器本地时区来拆「日期」和「钟点」，非 +08:00 的顾客会把 CST 上午 10:00
 * 看成自己所在时区的前一天 19:00——时段列表、日营收分桶、"今日客次"全都会错位。
 * 因此所有面向用户的时刻渲染一律锚定店铺时区，与浏览器时区无关。
 */
const storePartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: STORE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  // 必须显式 h23：只写 hour12:false 时，部分 ICU 版本会把 00:00 渲染成 "24"
  hourCycle: "h23",
});

function storeParts(value: string | number | Date) {
  const d = value instanceof Date ? value : new Date(value);
  const out: Record<string, string> = {};
  for (const p of storePartsFormatter.formatToParts(d)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return out;
}

/** 某个时刻在店铺时区的日历日 `YYYY-MM-DD`（用于分桶与查询区间） */
export function storeDateKey(value: string | number | Date): string {
  const p = storeParts(value);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 店铺时区某一天的 [00:00, 次日00:00) 对应的 UTC ISO 区间 */
export function storeDayBounds(
  value: string | number | Date
): { startIso: string; endIso: string } {
  const key = storeDateKey(value);
  // 用 UTC 日算术推进一天，setUTCDate 会自动处理月末溢出（10-31 → 11-01）
  const next = new Date(`${key}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextKey = next.toISOString().slice(0, 10);
  return {
    startIso: combineStoreDateTime(key, "00:00"),
    endIso: combineStoreDateTime(nextKey, "00:00"),
  };
}

/**
 * 从「日期字面量」取 `YYYY-MM-DD`（用于日期选择器里那些只代表某一天的 Date 对象）。
 * 注意：处理真实时刻请用 storeDateKey，不要用这个。
 */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeekMonday(d: Date): Date {
  const x = startOfLocalDay(d);
  return addDays(x, -((x.getDay() + 6) % 7));
}

/** 店铺时区「今天」所在周的周一（日期字面量 Date，供排班周视图做锚点） */
export function storeWeekStartMonday(value: string | number | Date = new Date()): Date {
  // 以店铺日期键为基准构造 UTC 正午，再回退到周一，避免浏览器时区影响周界
  const key = storeDateKey(value);
  const noonUtc = new Date(`${key}T12:00:00Z`);
  const dow = (noonUtc.getUTCDay() + 6) % 7; // 周一=0
  const monday = new Date(noonUtc);
  monday.setUTCDate(monday.getUTCDate() - dow);
  return new Date(`${monday.toISOString().slice(0, 10)}T00:00:00Z`);
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function weekdayLabel(d: Date): string {
  return WEEKDAYS[d.getDay()];
}

export function formatMD(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 从店铺日期字面量 `YYYY-MM-DD` 直接得到「M月D日」与星期，避免再用本地 Date 解析 */
export function monthDayFromKey(dateKeyStr: string): string {
  const [, m, d] = dateKeyStr.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

export function weekdayLabelFromKey(dateKeyStr: string): string {
  // 用 UTC 正午解析纯日期键，无论浏览器时区都不会漂到前后一天
  return weekdayLabel(new Date(`${dateKeyStr}T12:00:00Z`));
}

export function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  const p = storeParts(iso);
  return `${p.hour}:${p.minute}`;
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return `${storeDateKey(iso)} ${formatTime(iso)}`;
}

/**
 * 由「日期字面量」（日期选择器里那种只代表某一天的 Date）直接得到店铺时区当天 00:00 的
 * UTC 瞬间。必须走 dateKey+字面拼接，不能先 new Date(key) 再 storeDateKey：
 * 在 UTC+13/14 之类的浏览器里，本地午夜会落回前一天的 CST，从而整体错一天。
 */
export function storeDayBoundsFromLiteral(d: Date): { startIso: string; endIso: string } {
  const key = dateKey(d);
  const next = new Date(`${key}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    startIso: combineStoreDateTime(key, "00:00"),
    endIso: combineStoreDateTime(next.toISOString().slice(0, 10), "00:00"),
  };
}

/** 店铺时区的「星期几」标签（输入是时刻，不是日期字面量） */
export function storeWeekdayLabel(value: string | number | Date): string {
  return weekdayLabel(new Date(`${storeDateKey(value)}T12:00:00Z`));
}

/** 店铺时区的「M月D日」（输入是时刻，锚定店铺时区） */
export function storeMD(value: string | number | Date): string {
  const [, m, d] = storeDateKey(value).split("-");
  return `${Number(m)}月${Number(d)}日`;
}

/**
 * 店铺时区下「某个时刻所属月」的第一天 00:00 的 UTC 瞬间。
 * 用于「本月」类统计的区间下界：不能用 new Date(y, m, 1)（那是浏览器本地时区），
 * 否则非东八区设备会把月初/月末几个小时的单算进错误的月份。
 */
export function storeMonthStart(value: string | number | Date = new Date()): string {
  const ym = storeDateKey(value).slice(0, 7); // YYYY-MM
  return combineStoreDateTime(`${ym}-01`, "00:00");
}

/** 店铺时区下传入时刻所在「次日」00:00 的 UTC 瞬间（半开区间上界） */
export function storeNextDayStart(value: string | number | Date): string {
  const next = new Date(`${storeDateKey(value)}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return combineStoreDateTime(next.toISOString().slice(0, 10), "00:00");
}

export function formatCNY(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  return `¥${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

/**
 * 单笔预约的成交价口径（全站唯一来源）。
 *
 * 优先级：会员价快照 → 门市价快照 → 服务当前会员价 → 服务当前门市价。
 *
 * 为什么必须先读快照：快照是「下单那一刻」记下的价（0011/0014 起写入），
 * 用它才能保证事后调整 services 价目不会追溯改写历史单的金额与营收。
 * 为什么会员价优先于门市价：会员实际支付的是会员价，门市价只是挂牌对比价。
 *
 * 注意：不要退回直接读 services.price —— 那正是 0014 迁移修掉的错算，
 * 会让弹窗/报表显示顾客根本没付过的门市价。
 */
export function bookedPrice(a: {
  member_price_snapshot?: number | null;
  price_snapshot?: number | null;
  services?: { member_price?: number | null; price?: number | null } | null;
}): number {
  const snap = a.member_price_snapshot ?? a.price_snapshot;
  if (snap !== null && snap !== undefined) return Number(snap);
  const svc = a.services;
  return Number(svc?.member_price ?? svc?.price ?? 0);
}

export function formatDuration(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60}小时`;
  if (minutes < 60) return `${minutes}分钟`;
  return `${Math.floor(minutes / 60)}小时${minutes % 60}分钟`;
}

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "arrived"
  | "done"
  | "cancelled"
  | "no_show";

export const APPOINTMENT_STATUS_META: Record<
  string,
  { label: string; badge: string }
> = {
  pending: {
    label: "待确认",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
  },
  confirmed: {
    label: "已确认",
    badge: "bg-bronze-100 text-bronze-800 border-bronze-200",
  },
  arrived: {
    label: "已到店",
    badge: "bg-sky-100 text-sky-800 border-sky-200",
  },
  done: {
    label: "已完成",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  cancelled: {
    label: "已取消",
    badge: "bg-rose-100 text-rose-700 border-rose-200",
  },
  no_show: {
    label: "未到店",
    badge: "bg-stone-200 text-stone-600 border-stone-300",
  },
};

export const APPOINTMENT_STATUS_OPTIONS = Object.entries(
  APPOINTMENT_STATUS_META
).map(([value, meta]) => ({ value, label: meta.label }));

export const STOCK_STATUS_META: Record<string, { label: string; badge: string }> =
  {
    in_stock: {
      label: "在售",
      badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    },
    low_stock: {
      label: "库存紧张",
      badge: "bg-amber-100 text-amber-800 border-amber-200",
    },
    out_of_stock: {
      label: "已售罄",
      badge: "bg-stone-200 text-stone-600 border-stone-300",
    },
  };
