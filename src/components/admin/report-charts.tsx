"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCNY } from "@/lib/format";
import type { ReportStats } from "@/lib/report-stats";

/**
 * 报表页的三张图（趋势面积图 / 项目营收柱状图 / 状态环形图）。
 *
 * 从 reports 页面抽出：三张图连同自定义 tooltip 共约 240 行，与页面的
 * 取数、日期筛选、KPI 卡无关，只吃 stats 一个入参。
 *
 * mounted 由调用方传入：recharts 依赖真实 DOM 尺寸，SSR 输出与客户端不一致，
 * 必须等挂载后再画（否则水合报错）。
 */

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

const EMPTY_HINT = "flex size-full items-center justify-center text-xs text-bark-400";

export function ReportCharts({
  stats,
  mounted,
}: {
  stats: ReportStats;
  mounted: boolean;
}) {
  return (
    <>
      {/* 营收与客次趋势面积图 */}
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
              <div className={EMPTY_HINT}>统计区间内暂无走势数据</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 柱状图 + 饼图组合分析 */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* 热门项目营收贡献 */}
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
                    <XAxis
                      type="number"
                      stroke="#8a7767"
                      fontSize={11}
                      tickFormatter={(v) => `¥${v}`}
                    />
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
                    <Bar dataKey="revenue" fill="#b8860b" radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className={EMPTY_HINT}>暂无项目服务营收记录</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 客单状态构成环形图 */}
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
                <div className={EMPTY_HINT}>暂无预约状态分布数据</div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-3 text-[11px]">
              {stats.statusData.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-bark-600">
                    {item.name} ({item.value})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
