import { bookedPrice, combineStoreDateTime, storeDateKey } from "@/lib/format";
import type { Appointments, Members, Services, Staff } from "@/lib/types";

export interface ReportData {
  appointments: (Appointments & {
    services: { name: string; price: number; member_price: number | null } | null;
    price_snapshot?: number | null;
    member_price_snapshot?: number | null;
  })[];
  services: Services[];
  staff: Staff[];
  members: Members[];
}

export const STATUS_COLORS: Record<string, string> = {
  done: "#10b981", // emerald
  confirmed: "#b8860b", // bronze
  arrived: "#0284c7", // sky
  pending: "#f59e0b", // amber
  cancelled: "#f43f5e", // rose
  no_show: "#78716c", // stone
};

export const STATUS_LABELS: Record<string, string> = {
  done: "已完成",
  confirmed: "已确认",
  arrived: "已到店",
  pending: "待确认",
  cancelled: "已取消",
  no_show: "未到店",
};

export interface ReportStats {
  total: number;
  doneCount: number;
  cancelledCount: number;
  noShowCount: number;
  completionRate: number;
  revenue: number;
  trendData: { date: string; revenue: number; count: number }[];
  serviceRanking: { name: string; count: number; revenue: number }[];
  staffRanking: { name: string; count: number; doneCount: number }[];
  statusData: { name: string; value: number; color: string }[];
  newMembers: number;
  balanceSum: number;
}

/**
 * 由原始预约数据算出报表所需的全部统计。
 *
 * 纯函数，从 reports 页面抽出（原为页内 115 行的 useMemo）。抽出后可以单独
 * 推理与测试，页面只管取数与渲染。
 *
 * 口径提醒：营收一律走 bookedPrice（快照价优先于当前价），保证历史报表不会
 * 因为后来改价而变动。取消单不计入客次与技师负载。
 */
export function computeReportStats(
  data: ReportData,
  from: string,
  to: string
): ReportStats {
  const apts = data.appointments;
  const done = apts.filter((a) => a.status === "done");
  const cancelled = apts.filter((a) => a.status === "cancelled");
  const noShow = apts.filter((a) => a.status === "no_show");

  const revenue = done.reduce((sum, a) => sum + bookedPrice(a), 0);

  // 1. 每日营收与客次趋势
  const dailyMap = new Map<string, { date: string; revenue: number; count: number }>();
  for (const a of apts) {
    const day = storeDateKey(a.start_time);
    const cur = dailyMap.get(day) ?? { date: day.slice(5), revenue: 0, count: 0 };
    if (a.status === "done") {
      cur.revenue += bookedPrice(a);
    }
    if (a.status !== "cancelled") {
      cur.count += 1;
    }
    dailyMap.set(day, cur);
  }
  const trendData = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  // 2. 热门服务 Top 6
  const byService = new Map<string, { name: string; count: number; revenue: number }>();
  for (const a of apts) {
    if (!["done", "arrived", "confirmed"].includes(a.status)) continue;
    const name = a.services?.name ?? "未知项目";
    const prev = byService.get(name) ?? { name, count: 0, revenue: 0 };
    byService.set(name, {
      name,
      count: prev.count + 1,
      revenue: prev.revenue + (a.status === "done" ? bookedPrice(a) : 0),
    });
  }
  const serviceRanking = [...byService.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  // 3. 技师接单负载
  const byStaff = new Map<string, { name: string; count: number; doneCount: number }>();
  const staffNameById = new Map(data.staff.map((s) => [s.id, s.name] as const));
  for (const a of apts) {
    if (a.status === "cancelled") continue;
    const staffName = staffNameById.get(a.staff_id) ?? "未知工匠";
    const prev = byStaff.get(staffName) ?? { name: staffName, count: 0, doneCount: 0 };
    if (a.status === "done") prev.doneCount += 1;
    prev.count += 1;
    byStaff.set(staffName, prev);
  }
  const staffRanking = [...byStaff.values()].sort((a, b) => b.count - a.count);

  // 4. 预约状态构成
  const statusMap = new Map<string, number>();
  for (const a of apts) {
    statusMap.set(a.status, (statusMap.get(a.status) ?? 0) + 1);
  }
  const statusData = [...statusMap.entries()].map(([st, val]) => ({
    name: STATUS_LABELS[st] ?? st,
    value: val,
    color: STATUS_COLORS[st] ?? "#a8a29e",
  }));

  const startUtc = new Date(combineStoreDateTime(from, "00:00"));
  const nextDate = new Date(`${to}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const endUtc = new Date(
    combineStoreDateTime(nextDate.toISOString().slice(0, 10), "00:00")
  );

  const newMembers = data.members.filter((m) => {
    const created = new Date(m.created_at);
    return created >= startUtc && created < endUtc;
  });

  return {
    total: apts.length,
    doneCount: done.length,
    cancelledCount: cancelled.length,
    noShowCount: noShow.length,
    completionRate: apts.length === 0 ? 0 : Math.round((done.length / apts.length) * 100),
    revenue,
    trendData,
    serviceRanking,
    staffRanking,
    statusData,
    newMembers: newMembers.length,
    balanceSum: data.members.reduce((sum, m) => sum + Number(m.balance), 0),
  };
}
