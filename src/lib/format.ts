const pad = (n: number) => String(n).padStart(2, "0");

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

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function weekdayLabel(d: Date): string {
  return WEEKDAYS[d.getDay()];
}

export function formatMD(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${dateKey(d)} ${formatTime(iso)}`;
}

export function formatCNY(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  return `¥${Number.isInteger(n) ? n : n.toFixed(2)}`;
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
