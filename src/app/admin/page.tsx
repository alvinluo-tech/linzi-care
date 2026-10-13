"use client";

import {
  bookedPrice,
  formatCNY,
  formatTime,
  storeDayBounds,
  storeMonthStart,
} from "@/lib/format";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  ChartColumnBig,
  Clock3,
  Coins,
  Hourglass,
  Sparkles,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { SealMark } from "@/components/brand";
import { AppointmentDialog } from "@/components/admin/appointment-dialog";
import { NewAppointmentDialog } from "@/components/admin/new-appointment-dialog";
import { AdminQuickStart } from "@/components/admin/admin-quick-start";
import { useAppointmentsChanged } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { q } from "@/lib/supabase/query";
import type { AppointmentWithRefs, Members } from "@/lib/types";

export default function AdminDashboardPage() {
  const [todayAppointments, setTodayAppointments] = useState<
    AppointmentWithRefs[] | null
  >(null);
  const [pendingAppointments, setPendingAppointments] = useState<
    AppointmentWithRefs[] | null
  >(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [monthDone, setMonthDone] = useState<number | null>(null);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [balanceSum, setBalanceSum] = useState(0);

  const [selected, setSelected] = useState<AppointmentWithRefs | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const dayWindow = storeDayBounds(new Date());
    // 本月区间锚定店铺东八区（不能用 new Date(y,m,1)，那是浏览器本地时区）
    const monthStartIso = storeMonthStart(new Date());

    const [today, pending, done, members] = await Promise.all([
      q(() =>
        supabase
          .from("appointments")
          .select(
            "*, members(id, name, phone), staff(id, name, title), services(id, name, duration, price)"
          )
          .gte("start_time", dayWindow.startIso)
          .lt("start_time", dayWindow.endIso)
          .order("start_time")
      ),
      q(() =>
        supabase
          .from("appointments")
          .select(
            "*, members(id, name, phone), staff(id, name, title), services(id, name, duration, price)"
          )
          .eq("status", "pending")
          .order("start_time")
      ),
      q(() =>
        supabase
          .from("appointments")
          .select("services(price, member_price), price_snapshot, member_price_snapshot", {
            count: "exact",
          })
          .eq("status", "done")
          .gte("start_time", monthStartIso)
      ),
      q(() => supabase.from("members").select("id, balance", { count: "exact" })),
    ]);

    setTodayAppointments(
      (today.data as unknown as AppointmentWithRefs[]) ?? []
    );
    const pendingRows =
      (pending.data as unknown as AppointmentWithRefs[]) ?? [];
    setPendingAppointments(pendingRows);
    setPendingCount(pendingRows.length);
    setMonthDone(done.count ?? 0);
    const doneRows =
      (done.data as {
        services: { price: number; member_price: number | null } | null;
        price_snapshot: number | null;
        member_price_snapshot: number | null;
      }[] | null) ?? [];
    // 与报表/弹窗同口径：统一走 lib/format.ts 的 bookedPrice（快照优先、会员价优先），
    // 避免改价追溯改写历史营收，也避免三处各写一遍后逐渐漂移。
    setMonthRevenue(doneRows.reduce((sum, r) => sum + bookedPrice(r), 0));
    setMemberCount(members.count ?? 0);
    const balances = (members.data as Pick<Members, "balance">[] | null) ?? [];
    setBalanceSum(balances.reduce((sum, m) => sum + Number(m.balance), 0));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useAppointmentsChanged(() => {
    void load();
  });

  return (
    <div className="space-y-10">
      {/* 掌柜仪轨顶栏 */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/70 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <SealMark text="掌柜" />
            <h1 className="font-serif text-3xl text-bark-800">馆务总览 · 仪表盘</h1>
          </div>
          <p className="mt-2 text-xs text-bark-400">
            林梓精养馆（广州增城新塘国贸汇店）· 今日排班与资产调度
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={() => setNewOpen(true)}
            className="bg-bronze-500 text-white hover:bg-bronze-600"
          >
            <CalendarPlus className="size-4" /> 代客预约
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/calendar">
              <CalendarClock className="size-4" /> 周日历调度
            </Link>
          </Button>
        </div>
      </div>

      {/* 掌柜速览：默认折叠，首次上手时展开看，熟悉后不占版面 */}
      <AdminQuickStart />

      {/* 六角资产与调度印章式统计台 */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={Clock3}
          badge="今日"
          label="今日预约客次"
          value={
            todayAppointments === null ? null : `${todayAppointments.length} 次`
          }
          sub="按东八区当日0点至24点核算"
        />
        <StatCard
          icon={Hourglass}
          badge="待决"
          label="待确认预约"
          value={pendingCount === null ? null : `${pendingCount} 单`}
          sub="顾客前台递出，待掌柜接单 · 点击直达接单专区"
          accent
          onClick={() =>
            document
              .getElementById("pending-panel")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        />
        <StatCard
          icon={ChartColumnBig}
          badge="月度"
          label="本月已履约客次"
          value={monthDone === null ? null : `${monthDone} 次`}
          sub="顺利完成调理并归档"
        />
        <StatCard
          icon={Coins}
          badge="营收"
          label="本月履约营收"
          value={monthDone === null ? null : formatCNY(monthRevenue)}
          sub="实际完成服务价目累计"
          accent
        />
        <StatCard
          icon={UsersRound}
          badge="客群"
          label="馆内贵宾会员"
          value={memberCount === null ? null : `${memberCount} 位`}
          sub="封闭建档登记之会员档案"
        />
        <StatCard
          icon={Coins}
          badge="沉淀"
          label="会员余额存管"
          value={memberCount === null ? null : formatCNY(balanceSum)}
          sub="纯服务端权威字段，受触发器严密保护"
        />
      </div>

      {/* 待确认预约专栏：常驻显示，是掌柜接单的唯一固定入口（空态也有引导，避免入口"隐身"） */}
      <div
        id="pending-panel"
        className={`scroll-mt-24 overflow-hidden rounded-2xl border p-6 shadow-sm ${
          pendingAppointments && pendingAppointments.length > 0
            ? "border-amber-300/80 bg-gradient-to-br from-amber-50/70 via-card to-amber-50/40"
            : "border-border/80 bg-card"
        }`}
      >
        <div
          className={`flex items-center justify-between border-b pb-3.5 ${
            pendingAppointments && pendingAppointments.length > 0
              ? "border-amber-200/70"
              : "border-border/70"
          }`}
        >
          <div className="flex items-center gap-2">
            <Hourglass
              className={`size-4 ${
                pendingAppointments && pendingAppointments.length > 0
                  ? "text-amber-700"
                  : "text-bark-400"
              }`}
            />
            <h2
              className={`font-serif text-base font-medium ${
                pendingAppointments && pendingAppointments.length > 0
                  ? "text-amber-950"
                  : "text-bark-800"
              }`}
            >
              待确认预约 ({pendingAppointments?.length ?? "…"})
            </h2>
          </div>
          <span
            className={`text-xs ${
              pendingAppointments && pendingAppointments.length > 0
                ? "text-amber-800/80"
                : "text-bark-400"
            }`}
          >
            收到顾客预约后，在此确认接单
          </span>
        </div>

        {pendingAppointments === null ? (
          <div className="mt-4 space-y-2.5">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : pendingAppointments.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-10 text-center">
            <p className="font-serif text-sm text-bark-500">
              当前没有待确认的预约
            </p>
            <p className="max-w-md text-xs leading-relaxed text-bark-400">
              顾客在预约页下单后，客单会实时出现在这里（同时收到提示音与手机推送）。
              点击任一客单的「确认接单」即完成确认，顾客会同步收到通知。
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-2.5">
            {pendingAppointments.map((a) => (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                className="flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/90 bg-card/90 p-4 transition-all duration-200 hover:border-amber-400 hover:shadow-xs"
                onClick={() => setSelected(a)}
              >
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-serif text-base font-medium text-bark-800">
                      {a.members?.name ?? "匿名会员"}
                    </span>
                    <span className="font-serif text-xs text-bronze-700">
                      {a.services?.name ?? "理疗服务"}
                    </span>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="mt-1 text-xs text-bark-500">
                    预约时段：{formatTime(a.start_time)} – {formatTime(a.end_time)} · 指派技师：{a.staff?.name ?? "—"}
                    {a.remark ? ` · 备注：${a.remark}` : ""}
                  </p>
                </div>
                <Button size="sm" className="bg-bronze-500 text-xs text-white hover:bg-bronze-600">
                  处理此单
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 今日排班与预约手折 */}
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border/70 bg-paper/60 px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-bronze-600" />
            <h2 className="font-serif text-lg text-bark-800">今日到店预约排班</h2>
          </div>
          <span className="text-xs text-bark-400">
            支持点击对应行直接流转状态（确认 / 到店 / 完成 / 取消）
          </span>
        </div>

        <div>
          {todayAppointments === null ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : todayAppointments.length === 0 ? (
            <p className="py-16 text-center font-serif text-sm text-bark-400">
              今日暂无预约安排，敬候贵宾光临
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 bg-secondary/30 text-xs text-bark-500">
                  <TableHead className="w-28 pl-6">时辰</TableHead>
                  <TableHead>贵宾会员</TableHead>
                  <TableHead>调理项目</TableHead>
                  <TableHead>执操技师</TableHead>
                  <TableHead className="pr-6 text-right">当前状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {todayAppointments.map((a) => (
                  <TableRow
                    key={a.id}
                    className="cursor-pointer border-border/60 transition-colors hover:bg-paper/40"
                    onClick={() => setSelected(a)}
                  >
                    <TableCell className="pl-6 font-mono text-sm font-medium text-bark-800">
                      {formatTime(a.start_time)}
                    </TableCell>
                    <TableCell className="font-serif text-bark-800">
                      {a.members?.name ?? "—"}
                      {a.members?.phone ? (
                        <span className="ml-2 font-mono text-xs text-bark-400">
                          {a.members.phone}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-bark-700">
                      {a.services?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-bark-600">
                      {a.staff?.name ?? "—"}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <StatusBadge status={a.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <AppointmentDialog
        appointment={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onChanged={() => void load()}
      />
      <NewAppointmentDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onChanged={() => void load()}
      />

      {/* 快捷通道 */}
      <div className="flex flex-wrap gap-2.5">
        <Button asChild variant="outline" size="sm" className="text-xs">
          <Link href="/admin/members">
            <UserRoundCog className="size-3.5" /> 调整会员余额
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="text-xs">
          <Link href="/admin/schedule">
            <CalendarClock className="size-3.5" /> 设置技师排班
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="text-xs">
          <Link href="/admin/reports">
            <ChartColumnBig className="size-3.5" /> 经营报表
          </Link>
        </Button>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  badge,
  label,
  value,
  sub,
  accent,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  badge: string;
  label: string;
  value: string | null;
  sub: string;
  accent?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border p-6 shadow-sm transition-all duration-300 hover:shadow-md ${
        onClick ? "cursor-pointer" : ""
      } ${
        accent
          ? "border-bronze-300/90 bg-gradient-to-br from-card via-paper to-bronze-50/50"
          : "border-border/80 bg-card"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-serif text-[11px] tracking-widest text-bronze-700">
          {badge}
        </span>
        <span className="flex size-8 items-center justify-center rounded-full bg-secondary/80">
          <Icon className={`size-4 ${accent ? "text-bronze-600" : "text-bark-400"}`} />
        </span>
      </div>

      <div className="mt-4">
        <p className="text-xs text-bark-400">{label}</p>
        <div className="mt-1">
          {value === null ? (
            <Skeleton className="h-9 w-24" />
          ) : (
            <p className="font-serif text-3xl font-medium text-bark-800">
              {value}
            </p>
          )}
        </div>
      </div>

      <p className="mt-4 border-t border-border/60 pt-3 text-[11px] text-bark-400">
        {sub}
      </p>
    </div>
  );
}
