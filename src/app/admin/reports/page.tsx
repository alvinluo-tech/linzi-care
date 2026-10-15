"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TrendingUp, Award, Users, CheckCircle2, CalendarCheck2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportCharts } from "@/components/admin/report-charts";
import { useAppointmentsChanged } from "@/lib/hooks";
import { adminGet } from "@/lib/admin/client";
import { combineStoreDateTime, formatCNY, storeDateKey } from "@/lib/format";
import { computeReportStats, type ReportData } from "@/lib/report-stats";
import type { Members, Services, Staff } from "@/lib/types";

/**
 * 报表默认区间：本月 1 号 → 今天（门店时区）。
 *
 * **不能在渲染期调用**：服务端在构建时求值、客户端在运行时求值，跨天/跨月
 * 就会不一致（水合失败 React #418）。也不是"本页没有预渲染价值"就能豁免——
 * Next 仍会为它生成静态外壳。所以初值留空，挂载后再填。
 */
function defaultRange() {
  const now = new Date();
  return { from: storeDateKey(now).slice(0, 7) + "-01", to: storeDateKey(now) };
}

export default function AdminReportsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 图表（recharts）必须等客户端挂载后再渲染，否则 SSR 与客户端输出不一致。
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 这一处两件事都只能在客户端做：读 new Date()、以及给图表一个"可以画了"的信号。
    /* eslint-disable react-hooks/set-state-in-effect -- 日期默认值含 new Date()，渲染期取值会水合失败；mounted 是图表挂载信号。二者都只能在 effect 内完成 */
    const range = defaultRange();
    setFrom(range.from);
    setTo(range.to);
    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 该规则不追踪 async 边界：下面调用的 load() 首个动作就是 await 网络请求，setState 发生在 await 之后，非同步级联渲染。
    void load();
  }, [load]);

  useAppointmentsChanged(() => {
    void load();
  });

  const stats = useMemo(
    () => (data ? computeReportStats(data, from, to) : null),
    [data, from, to]
  );

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
            <span className="text-bark-400">至</span>
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

          <ReportCharts stats={stats} mounted={mounted} />

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
