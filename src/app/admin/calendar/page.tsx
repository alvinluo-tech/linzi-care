"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CalendarPlus, Filter, CalendarCheck, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppointmentDialog } from "@/components/admin/appointment-dialog";
import { NewAppointmentDialog } from "@/components/admin/new-appointment-dialog";
import { useAppointmentsChanged } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { adminGet, redirectToLoginIfUnauthorized } from "@/lib/admin/client";
import { q } from "@/lib/supabase/query";
import { addDays, storeDayBounds } from "@/lib/format";
import type { AppointmentWithRefs, Staff } from "@/lib/types";

// 动态客户端加载 Schedule-X，避免任何 SSR DOM/时钟预渲染不一致
const ScheduleCalendar = dynamic(
  () =>
    import("@/components/admin/schedule-calendar").then(
      (mod) => mod.ScheduleCalendar
    ),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="h-[600px] w-full rounded-lg" />
      </div>
    ),
  }
);

export default function AdminCalendarPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffFilter, setStaffFilter] = useState("all");
  const [appointments, setAppointments] = useState<AppointmentWithRefs[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<AppointmentWithRefs | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    // 默认加载前后 45 天范围的预约，供日历周视图、日视图和月网格自由切换浏览。
    // 边界锚定店铺东八区：用 startOfLocalDay（浏览器本地）在非 +08:00 设备上
    // 会把边缘当天的预约排除在日历之外。
    const rangeStartIso = storeDayBounds(addDays(new Date(), -30)).startIso;
    const rangeEndIso = storeDayBounds(addDays(new Date(), 60)).startIso;

    // 预约数据经服务端以核验过的 admin 身份读取：客户端会话若不是 admin，
    // members 内嵌关联会被 RLS 静默置空（表现为「匿名客户」）。
    const [aptRes, staffRes] = await Promise.all([
      adminGet<{ appointments: AppointmentWithRefs[]; error?: string }>(
        "/appointments",
        { from: rangeStartIso, to: rangeEndIso }
      ),
      q(() =>
        supabase.from("staff").select("*").eq("is_active", true).order("sort_order")
      ),
    ]);
    if (aptRes.error) {
      // 401 是登录态失效，直接送登录页；其余错误就地提示
      if (redirectToLoginIfUnauthorized(aptRes.error)) return;
      setLoadError(aptRes.error.message);
      setAppointments([]);
    } else {
      setLoadError(null);
      setAppointments(aptRes.data?.appointments ?? []);
    }
    setStaffList((staffRes.data as Staff[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useAppointmentsChanged(() => {
    void load();
  });

  return (
    <div className="space-y-6">
      {/* 顶部控制栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <CalendarCheck className="size-5 text-bronze-600" />
            <h1 className="font-serif text-2xl text-bark-800">排班与预约日历</h1>
          </div>
          <p className="mt-1 text-xs text-bark-400">
            基于现代交互日历 · 支持周历、日历与月度排盘切换 · 点击色块即可处理客单
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* 技师筛选 */}
          <div className="flex items-center gap-2">
            <Filter className="size-3.5 text-bark-400" />
            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger className="h-9 w-40 text-xs">
                <SelectValue placeholder="筛选技师" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部理疗技师</SelectItem>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.title ? ` · ${s.title}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={() => setNewOpen(true)}
            className="h-9 bg-bronze-500 text-xs text-white hover:bg-bronze-600"
          >
            <CalendarPlus className="mr-1.5 size-3.5" /> 新建代客预约
          </Button>
        </div>
      </div>

      {/* 取数失败必须显式告知：否则会把「读不到」当成「没有预约」 */}
      {loadError && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">预约数据加载失败</p>
            <p className="mt-0.5 text-rose-700/90">{loadError}</p>
          </div>
        </div>
      )}

      {/* Schedule-X 现代日历核心视图 */}
      {appointments === null ? (
        <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-xs">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      ) : (
        <ScheduleCalendar
          appointments={appointments}
          onSelectAppointment={setSelected}
          staffFilter={staffFilter}
        />
      )}

      {/* 弹窗联动 */}
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
    </div>
  );
}
