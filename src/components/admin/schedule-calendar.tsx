"use client";

import { useEffect, useMemo } from "react";
import { ScheduleXCalendar, useCalendarApp } from "@schedule-x/react";
import {
  createViewWeek,
  createViewDay,
  createViewMonthGrid,
  createViewMonthAgenda,
} from "@schedule-x/calendar";
import "@schedule-x/theme-default/dist/index.css";
import type { AppointmentWithRefs } from "@/lib/types";

interface ScheduleCalendarProps {
  appointments: AppointmentWithRefs[];
  onSelectAppointment: (appointment: AppointmentWithRefs) => void;
  staffFilter: string;
}

// 温润内敛的新中式轻奢色系：以宣纸暖米白打底，金铜与深木色提纲
const CALENDARS_CONFIG = {
  confirmed: {
    colorName: "confirmed",
    lightColors: {
      main: "#b8860b",        // 雅致金铜
      container: "#fbf6e9",   // 浅暖金宣底
      onContainer: "#5c4636", // 深木褐字
    },
  },
  done: {
    colorName: "done",
    lightColors: {
      main: "#15803d",        // 竹青翠绿
      container: "#f0fdf4",   // 浅竹宣纸
      onContainer: "#14532d",
    },
  },
  arrived: {
    colorName: "arrived",
    lightColors: {
      main: "#0369a1",        // 天青蓝
      container: "#f0f9ff",
      onContainer: "#0c4a6e",
    },
  },
  pending: {
    colorName: "pending",
    lightColors: {
      main: "#d97706",        // 琥珀黄
      container: "#fffbeb",
      onContainer: "#78350f",
    },
  },
  cancelled: {
    colorName: "cancelled",
    lightColors: {
      main: "#9ca3af",        // 水墨灰
      container: "#f3f4f6",
      onContainer: "#6b7280",
    },
  },
  no_show: {
    colorName: "no_show",
    lightColors: {
      main: "#78716c",
      container: "#f5f5f4",
      onContainer: "#44403c",
    },
  },
};

function formatToScheduleXTime(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function ScheduleCalendar({
  appointments,
  onSelectAppointment,
  staffFilter,
}: ScheduleCalendarProps) {
  const appointmentsMap = useMemo(() => {
    const map = new Map<string, AppointmentWithRefs>();
    appointments.forEach((a) => map.set(a.id, a));
    return map;
  }, [appointments]);

  const sxEvents = useMemo(() => {
    const filtered =
      staffFilter === "all"
        ? appointments
        : appointments.filter((a) => a.staff_id === staffFilter);

    return filtered.map((a) => {
      const customerName = a.members?.name ?? "匿名客户";
      const staffName = a.staff?.name ?? "待定技师";
      const serviceName = a.services?.name ?? "调理服务";

      return {
        id: a.id,
        title: `${customerName} · ${serviceName} (${staffName})`,
        start: formatToScheduleXTime(a.start_time),
        end: formatToScheduleXTime(a.end_time),
        calendarId: a.status in CALENDARS_CONFIG ? a.status : "pending",
        people: [customerName, staffName],
        description: a.remark ?? undefined,
      };
    });
  }, [appointments, staffFilter]);

  const calendar = useCalendarApp({
    views: [
      createViewWeek(),
      createViewDay(),
      createViewMonthGrid(),
      createViewMonthAgenda(),
    ],
    defaultView: "week",
    locale: "zh-CN",
    dayBoundaries: {
      start: "09:00",
      end: "22:00",
    },
    weekOptions: {
      gridHeight: 480, // 精致收紧，一屏纵览
      nDays: 7,
    },
    calendars: CALENDARS_CONFIG,
    callbacks: {
      onEventClick(calendarEvent) {
        const apt = appointmentsMap.get(String(calendarEvent.id));
        if (apt) {
          onSelectAppointment(apt);
        }
      },
    },
  });

  // 当预约数据或技师筛选变化时同步至 Schedule-X 实例
  useEffect(() => {
    if (calendar && calendar.events) {
      calendar.events.set(sxEvents);
    }
  }, [calendar, sxEvents]);

  return (
    <div className="schedule-x-theme-linzi overflow-hidden rounded-xl border border-bark-200/60 bg-[#FAF7F1] p-3 shadow-xs">
      <ScheduleXCalendar calendarApp={calendar} />

      {/* 底部集成雅致状态色例 */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-bark-200/40 pt-2.5 text-[11px] text-bark-500">
        <div className="flex items-center gap-1.5 font-serif text-bark-600">
          <span className="size-1.5 rotate-45 bg-bronze-600" />
          <span>点击色块客单，即可直接执行「确认接单 / 贵宾到店 / 完成理疗 / 取消」等状态流转</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-amber-500" /> 待确认
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-bronze-500" /> 已确认
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-sky-600" /> 已到店
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-600" /> 已完成
          </span>
          <span className="flex items-center gap-1 text-bark-400">
            <span className="size-2 rounded-full bg-stone-400" /> 已取消
          </span>
        </div>
      </div>
    </div>
  );
}
