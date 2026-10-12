"use client";

// 必须排在 @schedule-x 之前：Schedule-X 的日历事件内部按
// `start instanceof Temporal.ZonedDateTime` 判断类型，并直接调用
// `withTimeZone()`。浏览器已内置实验性 Temporal，其对象与 Schedule-X 期望的
// 实例判定不一致（事件对象会被当成普通字符串/异物），于是周视图构建时抛
// "this._start.withTimeZone is not a function"，整块时间网格渲染不出来 ——
// 表现就是「顾客预约了，后台日历里却什么都没有」。
// 先加载 polyfill 覆盖 globalThis.Temporal，并让事件用它的 ZonedDateTime 构造，
// 才能保证 instanceof 判定与 withTimeZone 都成立。
import "temporal-polyfill/global";
import { Temporal } from "temporal-polyfill";

import { useEffect, useMemo, useRef } from "react";
import { ScheduleXCalendar, useCalendarApp } from "@schedule-x/react";
import {
  createViewWeek,
  createViewDay,
  createViewMonthGrid,
  createViewMonthAgenda,
} from "@schedule-x/calendar";
import "@schedule-x/theme-default/dist/index.css";
import { CALENDAR_END_HOUR, CALENDAR_START_HOUR, STORE_TIMEZONE } from "@/lib/constants";
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

/**
 * 把库里的 UTC 时刻转成 Schedule-X 需要的 Temporal.ZonedDateTime。
 * 必须给出「店铺时区」的墙上时钟：Schedule-X 用它定位格子，
 * 若用浏览器本地时区，非 +08:00 的设备会把 CST 10:00 画到前一天。
 */
function toScheduleXDateTime(isoString: string): Temporal.ZonedDateTime {
  return Temporal.Instant.from(new Date(isoString).toISOString()).toZonedDateTimeISO(
    STORE_TIMEZONE
  );
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

  // useCalendarApp 只在挂载那一刻消费 config（@schedule-x/react 内部是 useEffect(..., [])），
  // 回调必须经 ref 读最新数据，否则点击「挂载之后才出现的事件」会静默无响应。
  const mapRef = useRef(appointmentsMap);
  const selectRef = useRef(onSelectAppointment);
  useEffect(() => {
    mapRef.current = appointmentsMap;
  }, [appointmentsMap]);
  useEffect(() => {
    selectRef.current = onSelectAppointment;
  }, [onSelectAppointment]);

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
        start: toScheduleXDateTime(a.start_time),
        end: toScheduleXDateTime(a.end_time),
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
    // 必须显式指定：Schedule-X 默认 timezone = 'UTC'，会让所有事件按 UTC 渲染
    // （CST 10:30 的单子显示成 02:30）。锚定店铺时区才能与门店作息一致。
    timezone: STORE_TIMEZONE,
    dayBoundaries: {
      start: `${String(CALENDAR_START_HOUR).padStart(2, "0")}:00`,
      end: `${String(CALENDAR_END_HOUR).padStart(2, "0")}:00`,
    },
    weekOptions: {
      gridHeight: 480, // 精致收紧，一屏纵览
      nDays: 7,
    },
    calendars: CALENDARS_CONFIG,
    callbacks: {
      onEventClick(calendarEvent) {
        const apt = mapRef.current.get(String(calendarEvent.id));
        if (apt) {
          selectRef.current(apt);
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
