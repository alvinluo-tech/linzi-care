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

const CALENDARS_CONFIG = {
  confirmed: {
    colorName: "confirmed",
    lightColors: {
      main: "#b8860b",
      container: "#fbf6e9",
      onContainer: "#63490f",
    },
  },
  done: {
    colorName: "done",
    lightColors: {
      main: "#10b981",
      container: "#ecfdf5",
      onContainer: "#065f46",
    },
  },
  arrived: {
    colorName: "arrived",
    lightColors: {
      main: "#0284c7",
      container: "#f0f9ff",
      onContainer: "#075985",
    },
  },
  pending: {
    colorName: "pending",
    lightColors: {
      main: "#d97706",
      container: "#fffbeb",
      onContainer: "#92400e",
    },
  },
  cancelled: {
    colorName: "cancelled",
    lightColors: {
      main: "#a8a29e",
      container: "#f5f5f4",
      onContainer: "#78716c",
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
      start: "08:00",
      end: "22:00",
    },
    weekOptions: {
      gridHeight: 900,
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
    <div className="schedule-x-theme-linzi rounded-xl border border-border bg-card p-3 shadow-xs">
      <ScheduleXCalendar calendarApp={calendar} />
    </div>
  );
}
