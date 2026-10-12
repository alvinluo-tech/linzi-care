"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarDays, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandMark, PageLoader, SealMark } from "@/components/brand";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import { q } from "@/lib/supabase/query";
import {
  formatMD,
  formatTime,
  weekdayLabel,
  storeDateKey,
  storeDayBounds,
} from "@/lib/format";
import { STORE_NAME } from "@/lib/constants";
import type { Schedules, Staff } from "@/lib/types";

/** my_guest_appointments RPC 返回的客单视图（姓名/电话经安全定义函数授权可见） */
interface GuestAppointment {
  appointment_id: string;
  start_time: string;
  end_time: string;
  status: string;
  remark: string | null;
  service_name: string;
  service_duration: number;
  member_name: string | null;
  member_phone: string | null;
}

export default function StaffPage() {
  const router = useRouter();
  const [me, setMe] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<Schedules[]>([]);
  const [appointments, setAppointments] = useState<GuestAppointment[]>([]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login?next=/staff");
      return;
    }

    const { data: staffRow } = await supabase
      .from("staff")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const staff = (staffRow as Staff) ?? null;
    setMe(staff);
    if (!staff) {
      setLoading(false);
      return;
    }

    const dayWindow = storeDayBounds(new Date());

    const [scheduleRes, appointmentRes] = await Promise.all([
      q(() =>
        supabase
          .from("schedules")
          .select("*")
          .eq("staff_id", staff.id)
          .gte("start_time", dayWindow.startIso)
          .order("start_time")
          .limit(60)
      ),
      // 安全定义函数：按「分配给自己的预约」返回顾客姓名/电话（不暴露余额等敏感列）
      q(() => supabase.rpc("my_guest_appointments")),
    ]);

    setSchedules((scheduleRes.data as Schedules[]) ?? []);
    const guestRows =
      (appointmentRes.data as GuestAppointment[] | null) ?? [];
    setAppointments(
      // 只保留「昨天及之后」的客单：按时刻比较，不做字符串比较
      // （PostgREST 返回的是 `+00:00` 形式，与 `Z` 后缀不可直接字典序比较）
      guestRows.filter(
        (a) =>
          new Date(a.start_time).getTime() >=
          new Date(dayWindow.startIso).getTime() - 24 * 60 * 60 * 1000
      )
    );
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, GuestAppointment[]>();
    for (const a of appointments) {
      const key = storeDateKey(a.start_time);
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map.entries()];
  }, [appointments]);

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push("/");
  };

  /** 技师打点：到店 / 完成 / 未到店（仅限分配给自己的客单） */
  const [marking, setMarking] = useState<string | null>(null);
  const mark = async (id: string, status: "arrived" | "done" | "no_show") => {
    setMarking(`${id}:${status}`);
    const { error } = await createClient().rpc("update_appointment_status", {
      p_appointment_id: id,
      p_status: status,
    });
    setMarking(null);
    if (error) {
      toast.error("操作失败", { description: error.message });
      return;
    }
    toast.success(
      status === "arrived" ? "已标记顾客到店" : status === "done" ? "服务已完成" : "已标记顾客未到"
    );
    void load();
  };

  if (loading) {
    return <PageLoader />;
  }

  if (!me) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4">
        <SealMark text="工匠" />
        <h1 className="mt-4 font-serif text-2xl text-bark-800">
          账号尚未关联技师档案
        </h1>
        <p className="text-xs text-bark-500">请联系店家掌柜为您录入排班工号。</p>
        <Button variant="outline" onClick={signOut}>
          <LogOut className="size-4" /> 退出登录
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background">
      {/* 工匠雅致顶栏 */}
      <header className="border-b border-border/80 bg-card shadow-xs">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div className="flex items-center gap-3">
            <BrandMark className="size-9 text-bark-700" />
            <div>
              <p className="font-serif tracking-widest text-bark-800">{STORE_NAME}</p>
              <div className="flex items-center gap-2 text-xs text-bark-500">
                <span className="font-serif text-bronze-700 font-medium">{me.name}</span>
                <span>·</span>
                <span>{me.title ?? "专属理疗师"}</span>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={signOut} className="text-xs">
            <LogOut className="size-3.5" /> 退出
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 md:px-6 md:py-14">
        <div className="flex items-center gap-3 border-b border-border/70 pb-5">
          <SealMark text="排班" />
          <div>
            <h1 className="font-serif text-2xl text-bark-800 md:text-3xl">
              我的工期与客单手卷
            </h1>
            <p className="mt-1 text-xs text-bark-400">
              排班时段由掌柜统一统筹调度；顾客在线预约将即时同步至此
            </p>
          </div>
        </div>

        <Tabs defaultValue="schedule" className="mt-8">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="schedule" className="gap-2">
              <CalendarClock className="size-4" /> 我的排班日历
            </TabsTrigger>
            <TabsTrigger value="appointments" className="gap-2">
              <CalendarDays className="size-4" /> 待履约客单
            </TabsTrigger>
          </TabsList>

          {/* 排班表 */}
          <TabsContent value="schedule" className="mt-8">
            {schedules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center text-xs text-bark-400">
                近期暂无轮值排班，请联系掌柜添加
              </div>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-2">
                {schedules.map((s) => {
                  const start = new Date(s.start_time);
                  return (
                    <div
                      key={s.id}
                      className="group rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-all duration-300 hover:border-bronze-300 hover:shadow-md"
                    >
                      <div className="flex items-center justify-between border-b border-border/60 pb-3">
                        <span className="font-serif text-xs font-medium text-bronze-700">
                          {weekdayLabel(start)} · {formatMD(start)}
                        </span>
                        <span className="rounded-sm bg-secondary px-2 py-0.5 text-[10px] text-bark-500">
                          全天排班
                        </span>
                      </div>
                      <p className="mt-4 font-mono text-xl font-medium text-bark-800">
                        {formatTime(s.start_time)} – {formatTime(s.end_time)}
                      </p>
                      {s.note && (
                        <p className="mt-2 text-xs text-bark-500">{s.note}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* 我的预约列表 */}
          <TabsContent value="appointments" className="mt-8 space-y-8">
            {grouped.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center text-xs text-bark-400">
                暂无分配给您的客单记录
              </div>
            ) : (
              grouped.map(([day, list]) => (
                <section key={day}>
                  <div className="flex items-center gap-2 border-b border-border/70 pb-3">
                    <span className="size-1.5 rotate-45 bg-bronze-600" />
                    <h2 className="font-serif text-base text-bark-800">
                      {weekdayLabel(new Date(`${day}T12:00:00`))}{" "}
                      {formatMD(new Date(`${day}T12:00:00`))}
                    </h2>
                  </div>
                  <div className="mt-4 space-y-3.5">
                    {list.map((a) => {
                      const canMark =
                        a.status === "confirmed" || a.status === "arrived";
                      return (
                      <div
                        key={a.appointment_id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-all duration-300 hover:border-bronze-300 hover:shadow-md"
                      >
                        <div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-base font-medium text-bark-800">
                              {formatTime(a.start_time)} – {formatTime(a.end_time)}
                            </span>
                            <StatusBadge status={a.status} />
                          </div>
                          <p className="mt-2 text-sm text-bark-700">
                            调理项目：<strong>{a.service_name}</strong>
                          </p>
                          <p className="mt-1 text-xs text-bark-500">
                            预约贵宾：{a.member_name ?? "—"}
                            {a.member_phone ? `（${a.member_phone}）` : ""}
                          </p>
                          {a.remark && (
                            <p className="mt-2 rounded-md bg-paper/80 px-2.5 py-1.5 text-xs text-bark-600">
                              嘱托：{a.remark}
                            </p>
                          )}
                        </div>

                        {/* 打点操作：仅已确认/已到店状态可见 */}
                        {canMark && (
                          <div className="flex flex-wrap gap-2">
                            {a.status === "confirmed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={marking !== null}
                                onClick={() => void mark(a.appointment_id, "arrived")}
                              >
                                {marking === `${a.appointment_id}:arrived` ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : null}
                                顾客到店
                              </Button>
                            )}
                            <Button
                              size="sm"
                              disabled={marking !== null}
                              onClick={() => void mark(a.appointment_id, "done")}
                              className="bg-bronze-500 text-white hover:bg-bronze-600"
                            >
                              {marking === `${a.appointment_id}:done` ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : null}
                              完成服务
                            </Button>
                            {a.status === "confirmed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={marking !== null}
                                onClick={() => void mark(a.appointment_id, "no_show")}
                                className="border-rose-200 text-rose-700 hover:bg-rose-50"
                              >
                                {marking === `${a.appointment_id}:no_show` ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : null}
                                未到店
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}