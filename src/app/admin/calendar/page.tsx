"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
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
import {
  addDays,
  formatMD,
  formatTime,
  startOfWeekMonday,
  weekdayLabel,
} from "@/lib/format";
import {
  CALENDAR_END_HOUR,
  CALENDAR_ROW_PX,
  CALENDAR_START_HOUR,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AppointmentWithRefs, Staff } from "@/lib/types";

const BLOCK_STYLES: Record<string, string> = {
  pending: "border-amber-400 bg-amber-50 text-amber-900",
  confirmed: "border-bronze-500 bg-bronze-50 text-bronze-900",
  arrived: "border-sky-400 bg-sky-50 text-sky-900",
  done: "border-emerald-400 bg-emerald-50 text-emerald-900",
  cancelled: "border-stone-300 bg-stone-100 text-stone-400 line-through",
  no_show: "border-stone-300 bg-stone-100 text-stone-400",
};

export default function AdminCalendarPage() {
  // 周起点在挂载后初始化（预渲染期不能调用 new Date()）
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffFilter, setStaffFilter] = useState("all");
  const [appointments, setAppointments] = useState<
    AppointmentWithRefs[] | null
  >(null);

  const [selected, setSelected] = useState<AppointmentWithRefs | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const weekEnd = useMemo(
    () => (weekStart ? addDays(weekStart, 7) : null),
    [weekStart]
  );
  const days = useMemo(
    () =>
      weekStart
        ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
        : [],
    [weekStart]
  );

  useEffect(() => {
    setWeekStart(startOfWeekMonday(new Date()));
  }, []);

  const load = useCallback(async () => {
    if (!weekStart || !weekEnd) return;
    const supabase = createClient();
    const [aptRes, staffRes] = await Promise.all([
      supabase
        .from("appointments")
        .select(
          "*, members(id, name, phone), staff(id, name, title), services(id, name, duration, price)"
        )
        .gte("start_time", weekStart.toISOString())
        .lt("start_time", weekEnd.toISOString())
        .order("start_time"),
      supabase.from("staff").select("*").eq("is_active", true).order("sort_order"),
    ]);
    setAppointments((aptRes.data as unknown as AppointmentWithRefs[]) ?? []);
    setStaffList((staffRes.data as Staff[]) ?? []);
  }, [weekStart, weekEnd]);

  useEffect(() => {
    setAppointments(null);
    void load();
  }, [load]);

  useAppointmentsChanged(() => {
    void load();
  });

  const visibleStaff = useMemo(
    () =>
      staffFilter === "all"
        ? staffList
        : staffList.filter((s) => s.id === staffFilter),
    [staffList, staffFilter]
  );

  const appointmentsOf = (staffId: string, day: Date) =>
    (appointments ?? []).filter(
      (a) =>
        a.staff_id === staffId &&
        new Date(a.start_time).toDateString() === day.toDateString()
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-bark-800">预约日历</h1>
          <p className="mt-1 text-sm text-bark-400">
            点击色块查看详情并流转状态 · 实时更新
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部技师</SelectItem>
              {staffList.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={!weekStart}
              onClick={() => weekStart && setWeekStart(addDays(weekStart, -7))}
              aria-label="上一周"
            >
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeekMonday(new Date()))}>
              本周
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={!weekStart}
              onClick={() => weekStart && setWeekStart(addDays(weekStart, 7))}
              aria-label="下一周"
            >
              <ChevronRight />
            </Button>
          </div>
          <Button
            onClick={() => setNewOpen(true)}
            className="bg-bronze-500 text-white hover:bg-bronze-600"
          >
            <CalendarPlus /> 新建预约
          </Button>
        </div>
      </div>

      {weekStart && (
        <p className="text-sm text-bark-500">
          {formatMD(weekStart)} – {formatMD(addDays(weekStart, 6))}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {appointments === null ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="min-w-[1100px]">
            {/* 星期表头 */}
            <div
              className="grid border-b border-border bg-secondary/40"
              style={{ gridTemplateColumns: "repeat(7, minmax(150px, 1fr))" }}
            >
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  className="border-l border-border/70 px-2 py-2 text-center text-xs text-bark-500 first:border-l-0"
                >
                  {weekdayLabel(day)} {formatMD(day)}
                </div>
              ))}
            </div>

            {/* 技师行：每行 7 天 */}
            {visibleStaff.map((staff) => (
              <div key={staff.id} className="border-b border-border/60 last:border-b-0">
                <div className="bg-secondary/20 px-3 py-1.5 font-serif text-sm text-bark-700">
                  {staff.name}
                  {staff.title ? ` · ${staff.title}` : ""}
                </div>
                <div
                  className="grid"
                  style={{ gridTemplateColumns: "repeat(7, minmax(150px, 1fr))" }}
                >
                  {days.map((day) => (
                    <DayCell
                      key={`${staff.id}-${day.toISOString()}`}
                      day={day}
                      appointments={appointmentsOf(staff.id, day)}
                      onSelect={setSelected}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
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
    </div>
  );
}

/** 单日单元格：按小时画横线，预约块绝对定位 */
function DayCell({
  day,
  appointments,
  onSelect,
}: {
  day: Date;
  appointments: AppointmentWithRefs[];
  onSelect: (a: AppointmentWithRefs) => void;
}) {
  const height = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * CALENDAR_ROW_PX;
  const dayStart = new Date(day);
  dayStart.setHours(CALENDAR_START_HOUR, 0, 0, 0);

  return (
    <div
      className="relative border-l border-border/60"
      style={{ height }}
    >
      {Array.from({
        length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1,
      }).map((_, i) => (
        <div
          key={i}
          className="absolute inset-x-0 border-t border-border/40"
          style={{ top: i * CALENDAR_ROW_PX }}
        />
      ))}

      {appointments.map((a) => {
        const start = new Date(a.start_time);
        const end = new Date(a.end_time);
        const minutesFromStart =
          (start.getTime() - dayStart.getTime()) / 60000;
        const durationMinutes = Math.max(
          (end.getTime() - start.getTime()) / 60000,
          30
        );
        const top = (minutesFromStart / 60) * CALENDAR_ROW_PX;
        const blockHeight = (durationMinutes / 60) * CALENDAR_ROW_PX - 2;

        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a)}
            className={cn(
              "absolute inset-x-1 overflow-hidden rounded-md border-l-2 px-2 py-1 text-left text-[11px] leading-tight shadow-sm transition-transform hover:scale-[1.01]",
              BLOCK_STYLES[a.status] ?? BLOCK_STYLES.cancelled
            )}
            style={{ top: Math.max(top, 0), height: Math.max(blockHeight, 22) }}
          >
            <span className="block font-medium">
              {formatTime(a.start_time)} {a.services?.name ?? "预约"}
            </span>
            <span className="block opacity-80">{a.members?.name ?? "—"}</span>
          </button>
        );
      })}
    </div>
  );
}
