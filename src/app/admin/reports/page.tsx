"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppointmentsChanged } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { dateKey, formatCNY, startOfLocalDay } from "@/lib/format";
import type {
  Appointments,
  Members,
  Services,
  Staff,
} from "@/lib/types";

interface ReportData {
  appointments: (Appointments & { services: { name: string } | null })[];
  services: Services[];
  staff: Staff[];
  members: Members[];
}

export default function AdminReportsPage() {
  // 默认统计区间在挂载后初始化（预渲染期不能调用 new Date()）
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<ReportData | null>(null);

  const load = useCallback(async () => {
    if (!from || !to) return;
    const supabase = createClient();
    const startIso = new Date(`${from}T00:00:00`).toISOString();
    const endIso = new Date(`${to}T23:59:59.999`).toISOString();

    const [aptRes, servicesRes, staffRes, membersRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("*, services(name)")
        .gte("start_time", startIso)
        .lte("start_time", endIso)
        .order("start_time"),
      supabase.from("services").select("*"),
      supabase.from("staff").select("*"),
      supabase.from("members").select("*"),
    ]);

    setData({
      appointments:
        (aptRes.data as (Appointments & { services: { name: string } | null })[]) ??
        [],
      services: (servicesRes.data as Services[]) ?? [],
      staff: (staffRes.data as Staff[]) ?? [],
      members: (membersRes.data as Members[]) ?? [],
    });
  }, [from, to]);

  useEffect(() => {
    const now = new Date();
    setFrom(dateKey(new Date(now.getFullYear(), now.getMonth(), 1)));
    setTo(dateKey(startOfLocalDay(now)));
  }, []);

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
    const priceOf = (serviceId: string) =>
      data.services.find((s) => s.id === serviceId)?.price ?? 0;
    const revenue = done.reduce(
      (sum, a) => sum + Number(priceOf(a.service_id)),
      0
    );

    const byService = new Map<string, { count: number; revenue: number }>();
    for (const a of apts) {
      if (!["done", "arrived", "confirmed"].includes(a.status)) continue;
      const name = a.services?.name ?? "未知项目";
      const prev = byService.get(name) ?? { count: 0, revenue: 0 };
      byService.set(name, {
        count: prev.count + 1,
        revenue: prev.revenue + (a.status === "done" ? Number(priceOf(a.service_id)) : 0),
      });
    }

    const byStaff = new Map<string, number>();
    for (const a of apts) {
      if (a.status === "cancelled") continue;
      byStaff.set(a.staff_id, (byStaff.get(a.staff_id) ?? 0) + 1);
    }

    const newMembers = data.members.filter((m) => {
      const created = new Date(m.created_at);
      return (
        created >= new Date(`${from}T00:00:00`) &&
        created <= new Date(`${to}T23:59:59.999`)
      );
    });

    return {
      total: apts.length,
      doneCount: done.length,
      cancelledCount: cancelled.length,
      noShowCount: noShow.length,
      completionRate:
        apts.length === 0 ? 0 : Math.round((done.length / apts.length) * 100),
      revenue,
      byService: [...byService.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      byStaff: [...byStaff.entries()]
        .map(([staffId, count]) => ({
          name: data.staff.find((s) => s.id === staffId)?.name ?? "未知",
          count,
        }))
        .sort((a, b) => b.count - a.count),
      newMembers: newMembers.length,
      balanceSum: data.members.reduce((sum, m) => sum + Number(m.balance), 0),
    };
  }, [data, from, to]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-bark-800">基础报表</h1>
          <p className="mt-1 text-sm text-bark-400">按日期区间统计预约与经营概况</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">开始日期</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">结束日期</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
        </div>
      </div>

      {stats === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="预约总数" value={String(stats.total)} />
            <Stat label="已完成" value={String(stats.doneCount)} />
            <Stat
              label="完成率"
              value={`${stats.completionRate}%`}
              sub={`取消 ${stats.cancelledCount} · 爽约 ${stats.noShowCount}`}
            />
            <Stat
              label="营收（已完成）"
              value={formatCNY(stats.revenue)}
              accent
            />
            <Stat label="新增会员" value={String(stats.newMembers)} />
            <Stat label="会员余额总额" value={formatCNY(stats.balanceSum)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-lg">热门项目 Top 5</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.byService.length === 0 ? (
                  <p className="py-6 text-center text-sm text-bark-400">
                    区间内暂无数据
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>项目</TableHead>
                        <TableHead className="text-right">预约数</TableHead>
                        <TableHead className="text-right">营收</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.byService.map((s) => (
                        <TableRow key={s.name}>
                          <TableCell className="text-bark-700">{s.name}</TableCell>
                          <TableCell className="text-right">{s.count}</TableCell>
                          <TableCell className="text-right text-bronze-700">
                            {formatCNY(s.revenue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-lg">技师接单排名</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.byStaff.length === 0 ? (
                  <p className="py-6 text-center text-sm text-bark-400">
                    区间内暂无数据
                  </p>
                ) : (
                  <div className="space-y-3">
                    {stats.byStaff.map((s) => {
                      const max = stats.byStaff[0]?.count || 1;
                      return (
                        <div key={s.name}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-bark-700">{s.name}</span>
                            <span className="text-bark-500">{s.count} 单</span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-bronze-500"
                              style={{ width: `${(s.count / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-bronze-200" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-normal text-bark-500">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={`font-serif text-2xl ${accent ? "text-bronze-700" : "text-bark-800"}`}
        >
          {value}
        </p>
        {sub && <p className="mt-1 text-xs text-bark-400">{sub}</p>}
      </CardContent>
    </Card>
  );
}
