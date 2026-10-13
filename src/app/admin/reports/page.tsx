"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  Award,
  Users,
  CheckCircle2,
  CalendarCheck2,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppointmentsChanged } from "@/lib/hooks";
import { adminGet } from "@/lib/admin/client";
import {
  combineStoreDateTime,
  formatCNY,
  storeDateKey,
} from "@/lib/format";
import type { Appointments, Members, Services, Staff } from "@/lib/types";

interface ReportData {
  appointments: (Appointments & {
    services: { name: string; price: number; member_price: number | null } | null;
    price_snapshot?: number | null;
    member_price_snapshot?: number | null;
  })[];
  services: Services[];
  staff: Staff[];
  members: Members[];
}

/**
 * 单笔已完成预约的成交价。
 * 优先读下单时点的快照（0011 起写入），没有快照的历史单才回退到服务当前会员价/门市价。
 * 用快照而非服务现价，是为了让「调价」不再追溯改写历史营收；
 * 会员价优先于门市价，因为会员实际支付的是会员价。
 */
function bookedPrice(a: ReportData["appointments"][number]): number {
  const snapshot = a.member_price_snapshot ?? a.price_snapshot;
  if (snapshot !== null && snapshot !== undefined) return Number(snapshot);
  const svc = a.services;
  return Number(svc?.member_price ?? svc?.price ?? 0);
}

const STATUS_COLORS: Record<string, string> = {
  done: "#10b981",       // emerald
  confirmed: "#b8860b",  // bronze
  arrived: "#0284c7",    // sky
  pending: "#f59e0b",    // amber
  cancelled: "#f43f5e",  // rose
  no_show: "#78716c",    // stone
};

const STATUS_LABELS: Record<string, string> = {
  done: "已完成",
  confirmed: "已确认",
  arrived: "已到店",
  pending: "待确认",
  cancelled: "已取消",
  no_show: "未到店",
};

export default function AdminReportsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const now = new Date();
    setFrom(storeDateKey(now).slice(0, 7) + "-01");
    setTo(storeDateKey(now));
  }, []);

  const load = useCallback(async () => {
    if (!from || !to) return;
    // 严格按店铺东八区营业时间边界生成查询区间 [YYYY-MM-DD 00:00:00+08:00, YYYY-MM-DD 23:59:59.999+08:00]
    const startIso = combineStoreDateTime(from, "00:00");
    // 次日 00:00 之前（等价于当日 24:00）
    const nextDate = new Date(`${to}T00:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const endIso = combineStoreDateTime(nextDate.toISOString().slice(0, 10), "00:00");

    // 报表经服务端以核验过的 admin 身份读取，避免客户端非 admin 会话下
    // 关联与统计被 RLS 静默裁剪。
    const res = await adminGet<{
      appointments: ReportData["appointments"];
      services: Services[];
      staff: Staff[];
      members: Members[];
      error?: string;
    }>("/reports", { from: startIso, to: endIso });

    // 任一查询失败都不能把「查不出来」渲染成「本店零营收」：
    // 失败时保留上一次的 data，不清空成空报表。
    if (res.error) {
      setLoadError(res.error.message);
      return;
    }
    setLoadError(null);

    const payload = res.data;
    if (!payload) {
      setLoadError("服务端返回了空响应，请刷新重试");
      return;
    }
    setData({
      appointments: payload.appointments ?? [],
      services: payload.services ?? [],
      staff: payload.staff ?? [],
      members: payload.members ?? [],
    });
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  useAppointmentsChanged(() => {
    void load();
  });

  const stats = useMemo(() => {
    if (!data) return null;
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
    const endUtc = new Date(combineStoreDateTime(nextDate.toISOString().slice(0, 10), "00:00"));

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
  }, [data, from, to]);

  return (
    <div className="space-y-8">
      {/* 标题与日期筛选 */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/70 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="size-5 text-bronze-600" />
            <h1 className="font-serif text-2xl text-bark-800">经营数据洞察 · 报表分析</h1>
          </div>
          <p className="mt-1 text-xs text-bark-400">
            多维度统计营收走势、客流曲线、服务项目吸金力与技师负荷分布
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2 text-xs shadow-xs">
          <div className="flex items-center gap-1.5">
            <Label className="text-bark-500 font-normal">统计区间：</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-36 text-xs"
            />
            <span className="text-bark-300">至</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 w-36 text-xs"
            />
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-rose-200 bg-rose-50/60 px-6 py-12 text-center">
          <p className="font-serif text-base text-rose-800">报表数据加载失败</p>
          <p className="max-w-md text-xs leading-relaxed text-rose-700/80">
            {loadError}
            <br />
            这表示读取失败而非本店没有经营数据，因此没有显示空报表。请稍后重试。
          </p>
        </div>
      ) : stats === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {/* 核心指标 KPI 卡片 */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={CalendarCheck2}
              label="区间预约总次"
              value={`${stats.total} 单`}
              sub={`待确认/履约中 ${(stats.total - stats.doneCount - stats.cancelledCount - stats.noShowCount)} 单`}
            />
            <KpiCard
              icon={CheckCircle2}
              label="实际履约完成"
              value={`${stats.doneCount} 单`}
              sub={`履约完成率 ${stats.completionRate}%`}
              highlight
            />
            <KpiCard
              icon={Award}
              label="履约总营收（已核销）"
              value={formatCNY(stats.revenue)}
              sub={`取消 ${stats.cancelledCount} · 爽约 ${stats.noShowCount}`}
              accent
            />
            <KpiCard
              icon={Users}
              label="新开会籍 / 总池"
              value={`${stats.newMembers} 位新增`}
              sub={`在池会员总余额 ${formatCNY(stats.balanceSum)}`}
            />
          </div>

          {/* 营收与客次趋势面积图 (Recharts AreaChart) */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="font-serif text-lg text-bark-800">
                  每日营收与客流走势
                </CardTitle>
                <CardDescription className="text-xs text-bark-400">
                  实线展示每日核销营收额（元），配合折线跟踪履约客单数（单）
                </CardDescription>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-bronze-700 font-medium">
                  <span className="size-2.5 rounded-full bg-bronze-500" />
                  营收 (元)
                </span>
                <span className="flex items-center gap-1.5 text-bark-500">
                  <span className="size-2.5 rounded-full bg-bark-400" />
                  客次 (单)
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                {mounted && stats.trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={stats.trendData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#b8860b" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#b8860b" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7dcd2" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="#8a7767"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#8a7767"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `¥${v}`}
                      />
                      <Tooltip content={<CustomTrendTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        name="营收"
                        stroke="#b8860b"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#revenueGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-bark-400">
                    统计区间内暂无走势数据
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 柱状图 + 饼图组合分析 */}
          <div className="grid gap-6 lg:grid-cols-12">
            {/* 热门项目营收贡献 (Recharts BarChart) */}
            <Card className="border-border/80 shadow-xs lg:col-span-7">
              <CardHeader className="pb-3">
                <CardTitle className="font-serif text-lg text-bark-800">
                  服务项目营收排行 (Top 6)
                </CardTitle>
                <CardDescription className="text-xs text-bark-400">
                  统计区间内各项服务创造的已核销总营收额
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  {mounted && stats.serviceRanking.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={stats.serviceRanking}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e7dcd2" horizontal={false} />
                        <XAxis type="number" stroke="#8a7767" fontSize={11} tickFormatter={(v) => `¥${v}`} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          stroke="#4a382b"
                          fontSize={12}
                          width={85}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip content={<CustomServiceTooltip />} />
                        <Bar
                          dataKey="revenue"
                          fill="#b8860b"
                          radius={[0, 4, 4, 0]}
                          barSize={18}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-bark-400">
                      暂无项目服务营收记录
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 客单状态构成环形图 (Recharts PieChart) */}
            <Card className="border-border/80 shadow-xs lg:col-span-5">
              <CardHeader className="pb-3">
                <CardTitle className="font-serif text-lg text-bark-800">
                  预约状态分布
                </CardTitle>
                <CardDescription className="text-xs text-bark-400">
                  客单转化与履约漏斗占比
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  {mounted && stats.statusData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.statusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={78}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {stats.statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomStatusTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-bark-400">
                      暂无预约状态分布数据
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-3 text-[11px]">
                  {stats.statusData.map((item) => (
                    <div key={item.name} className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-bark-600">
                        {item.name} ({item.value})
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 技师接单负载排行 */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-4">
              <CardTitle className="font-serif text-lg text-bark-800">
                技师工匠接单与履约表现
              </CardTitle>
              <CardDescription className="text-xs text-bark-400">
                记录每位调理技师的总接单数与实际完成单数
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.staffRanking.length === 0 ? (
                <p className="py-8 text-center text-xs text-bark-400">暂无技师接单数据</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stats.staffRanking.map((s, idx) => {
                    const rate = s.count > 0 ? Math.round((s.doneCount / s.count) * 100) : 0;
                    return (
                      <div
                        key={s.name}
                        className="rounded-lg border border-border bg-paper/60 p-4 shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex size-6 items-center justify-center rounded-full bg-bronze-100 font-serif text-xs font-bold text-bronze-800">
                              {idx + 1}
                            </span>
                            <span className="font-serif text-sm font-medium text-bark-800">
                              {s.name}
                            </span>
                          </div>
                          <span className="text-xs font-medium text-bronze-700">
                            {s.count} 单接单
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-bark-500">
                          <span>已完成 {s.doneCount} 单</span>
                          <span>履约率 {rate}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
                          <div
                            className="h-full rounded-full bg-bronze-500 transition-all duration-500"
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  highlight?: boolean;
}) {
  return (
    <Card
      className={
        accent
          ? "border-bronze-300 bg-gradient-to-br from-card to-bronze-50/50 shadow-xs"
          : highlight
          ? "border-emerald-200 bg-emerald-50/20 shadow-xs"
          : "border-border shadow-xs"
      }
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-normal text-bark-500">{label}</CardTitle>
        <Icon
          className={`size-4 ${
            accent
              ? "text-bronze-600"
              : highlight
              ? "text-emerald-600"
              : "text-bark-300"
          }`}
        />
      </CardHeader>
      <CardContent>
        <p
          className={`font-serif text-2xl font-semibold ${
            accent ? "text-bronze-700" : highlight ? "text-emerald-700" : "text-bark-800"
          }`}
        >
          {value}
        </p>
        {sub && <p className="mt-1.5 text-[11px] text-bark-400">{sub}</p>}
      </CardContent>
    </Card>
  );
}

interface TooltipPayloadItem {
  value: number;
  name?: string;
  color?: string;
  payload: Record<string, unknown>;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
}

function CustomTrendTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-bronze-200 bg-card p-3 shadow-md">
        <p className="font-serif text-xs font-medium text-bark-800">{String(label)}</p>
        <p className="mt-1 text-sm font-semibold text-bronze-700">
          营收：{formatCNY(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
}

function CustomServiceTooltip({ active, payload }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const data = payload[0].payload as { name: string; revenue: number; count: number };
    return (
      <div className="rounded-lg border border-bronze-200 bg-card p-3 shadow-md">
        <p className="font-serif text-xs font-medium text-bark-800">{data.name}</p>
        <p className="mt-1 text-sm font-semibold text-bronze-700">
          创收：{formatCNY(data.revenue)}
        </p>
        <p className="text-xs text-bark-500">累计预约：{data.count} 次</p>
      </div>
    );
  }
  return null;
}

function CustomStatusTooltip({ active, payload }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const data = payload[0];
    const itemPayload = data.payload as { color?: string };
    return (
      <div className="rounded-lg border border-border bg-card p-2.5 shadow-md text-xs">
        <span style={{ color: itemPayload.color }} className="font-medium">
          {data.name}
        </span>
        <span className="ml-2 font-semibold text-bark-800">{data.value} 单</span>
      </div>
    );
  }
  return null;
}
