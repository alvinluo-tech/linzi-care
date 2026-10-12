"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { q } from "@/lib/supabase/query";
import {
  addDays,
  formatMD,
  formatTime,
  startOfWeekMonday,
  weekdayLabel,
} from "@/lib/format";
import { storeDayBoundsFromLiteral } from "@/lib/format";
import { combineStoreDateTime } from "@/lib/constants";
import type { Schedules, Staff } from "@/lib/types";

export default function AdminSchedulePage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffId, setStaffId] = useState<string>("");
  // 周起点在挂载后初始化（预渲染期不能调用 new Date()）
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [schedules, setSchedules] = useState<Schedules[] | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("19:00");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const days = useMemo(
    () =>
      weekStart
        ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
        : [],
    [weekStart]
  );
  const weekEnd = useMemo(
    () => (weekStart ? addDays(weekStart, 7) : null),
    [weekStart]
  );

  useEffect(() => {
    setWeekStart(startOfWeekMonday(new Date()));
  }, []);

  const load = useCallback(async () => {
    const supabase = createClient();
    // 先加载技师列表（含未选择技师时的默认选中），再按需加载该周排班
    const staffRes = await q(() =>
      supabase.from("staff").select("*").order("sort_order")
    );
    const staff = (staffRes.data as Staff[]) ?? [];
    setStaffList(staff);

    const activeId = staffId || staff[0]?.id || "";
    if (activeId && !staffId && staff.length > 0) setStaffId(staff[0].id);
    if (!activeId || !weekStart || !weekEnd) {
      setSchedules([]);
      return;
    }

    const scheduleRes = await q(() =>
      supabase
        .from("schedules")
        .select("*")
        .eq("staff_id", activeId)
        .gte("start_time", storeDayBoundsFromLiteral(weekStart).startIso)
        .lt("start_time", storeDayBoundsFromLiteral(weekEnd).startIso)
        .order("start_time")
    );
    setSchedules((scheduleRes.data as Schedules[]) ?? []);
  }, [staffId, weekStart, weekEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  const schedulesOf = (day: Date) =>
    (schedules ?? []).filter(
      (s) => new Date(s.start_time).toDateString() === day.toDateString()
    );

  const submit = async () => {
    if (!staffId || !addDate || !startTime || !endTime) {
      toast.error("请补全排班信息");
      return;
    }
    if (endTime <= startTime) {
      toast.error("结束时间需晚于开始时间");
      return;
    }
    setSubmitting(true);
    const { error } = await createClient().from("schedules").insert({
      staff_id: staffId,
      start_time: combineStoreDateTime(addDate, startTime),
      end_time: combineStoreDateTime(addDate, endTime),
      note: note.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error("添加失败", { description: error.message });
      return;
    }
    toast.success("排班已添加");
    setAddOpen(false);
    setNote("");
    void load();
  };

  const remove = async (schedule: Schedules) => {
    const { error } = await createClient()
      .from("schedules")
      .delete()
      .eq("id", schedule.id);
    if (error) {
      toast.error("删除失败", { description: error.message });
      return;
    }
    toast.success("已删除");
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-bark-800">排班设置</h1>
          <p className="mt-1 text-sm text-bark-400">
            排班以门店时区（东八区）为准 · 顾客只能预约排班内的时段
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="选择技师" />
            </SelectTrigger>
            <SelectContent>
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekStart(startOfWeekMonday(new Date()))}
            >
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
            disabled={!staffId}
            onClick={() => {
              setAddDate("");
              setAddOpen(true);
            }}
            className="bg-bronze-500 text-white hover:bg-bronze-600"
          >
            <CalendarPlus /> 添加排班
          </Button>
        </div>
      </div>

      {weekStart && (
        <p className="text-sm text-bark-500">
          {formatMD(weekStart)} – {formatMD(addDays(weekStart, 6))}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {schedules === null ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid min-w-[900px] grid-cols-7">
            {days.map((day) => {
              const daySchedules = schedulesOf(day);
              return (
                <div
                  key={day.toISOString()}
                  className="min-h-40 border-l border-border/60 p-2 first:border-l-0"
                >
                  <p className="mb-2 text-center text-xs text-bark-500">
                    {weekdayLabel(day)} {formatMD(day)}
                  </p>
                  <div className="space-y-2">
                    {daySchedules.map((s) => (
                      <div
                        key={s.id}
                        className="group rounded-md border border-bronze-200 bg-bronze-50 px-2.5 py-2 text-xs"
                      >
                        <p className="font-medium text-bronze-900">
                          {formatTime(s.start_time)} – {formatTime(s.end_time)}
                        </p>
                        {s.note && (
                          <p className="mt-0.5 text-bark-500">{s.note}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => void remove(s)}
                          className="mt-1 hidden items-center gap-1 text-rose-700 group-hover:flex"
                        >
                          <Trash2 className="size-3" /> 删除
                        </button>
                      </div>
                    ))}
                    {daySchedules.length === 0 && (
                      <p className="py-4 text-center text-xs text-bark-300">休</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 添加排班 */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">添加排班</DialogTitle>
            <DialogDescription>
              为所选技师添加可接单时间段，可添加多段
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>技师</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>日期</Label>
              <Input
                type="date"
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>开始时间</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>结束时间</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>备注（选填）</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="如：晚班"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button
              onClick={submit}
              disabled={submitting || !addDate}
              className="bg-bronze-500 text-white hover:bg-bronze-600"
            >
              {submitting ? "添加中…" : "添加排班"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
