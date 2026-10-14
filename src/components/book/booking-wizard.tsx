"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock, LogIn, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { BrandMark, OrnamentDivider, SealMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { q } from "@/lib/supabase/query";
import {
  addDays,
  dateKey,
  formatCNY,
  formatDateTime,
  formatDuration,
  formatMD,
  formatTime,
  weekdayLabel,
} from "@/lib/format";
import { BOOKING_DAYS_AHEAD } from "@/lib/constants";
import { slotMoodLabel } from "@/lib/design";
import type { Members, Services, Staff, StaffServices } from "@/lib/types";
import { PushNotificationButton } from "@/components/pwa/push-notification-button";

const STEPS = [
  { order: "壹", label: "择项目", desc: "心仪调理" },
  { order: "贰", label: "选技师", desc: "专属工匠" },
  { order: "叁", label: "定时段", desc: "沉静时刻" },
  { order: "肆", label: "定预约", desc: "核对呈送" },
] as const;

const DRAFT_KEY = "linzi-booking-draft-v1";

interface Draft {
  serviceId?: string;
  staffId?: string;
  date?: string;
  slot?: string;
  remark?: string;
}

export function BookingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [services, setServices] = useState<Services[] | null>(null);
  const [staffList, setStaffList] = useState<Staff[] | null>(null);
  const [staffServices, setStaffServices] = useState<StaffServices[] | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [remark, setRemark] = useState("");

  const [step, setStep] = useState(0);
  const [member, setMember] = useState<Members | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookedId, setBookedId] = useState<string | null>(null);
  // 从 /book?service=<id> 进来时记下是哪个项目，用于落地后自动滚到该卡片并高亮，
  // 否则用户停在页面顶部、选中卡片在折叠线以下，会以为"点了没反应"而重复点选。
  const [deepLinkServiceId, setDeepLinkServiceId] = useState<string | null>(null);
  const deepLinkRef = useRef<HTMLButtonElement | null>(null);
  // 老板已确认的规则：券优先于余额。所以这里不做得选，命中就自动用。
  const [passes, setPasses] = useState<
    { id: string; title: string; expires_at: string | null }[]
  >([]);

  const restoreDraft = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      return raw ? (JSON.parse(raw) as Draft) : {};
    } catch {
      return {};
    }
  }, []);

  useEffect(() => {
    const preService = searchParams.get("service");
    const draft = restoreDraft();
    const initial: Draft = preService ? { ...draft, serviceId: preService } : draft;
    if (initial.serviceId) setServiceId(initial.serviceId);
    if (initial.staffId) setStaffId(initial.staffId);
    if (initial.date) setDate(initial.date);
    if (initial.slot) setSlot(initial.slot);
    if (initial.remark) setRemark(initial.remark);
    // 只有显式带 ?service= 才触发定位滚动；从草稿恢复时不打扰用户
    if (preService) setDeepLinkServiceId(preService);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 项目列表就绪后，把深链选中的卡片滚到视野中部并短暂高亮
  useEffect(() => {
    if (!deepLinkServiceId || !services) return;
    const t = setTimeout(() => {
      deepLinkRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(t);
  }, [deepLinkServiceId, services]);

  useEffect(() => {
    const draft: Draft = {
      serviceId: serviceId ?? undefined,
      staffId: staffId ?? undefined,
      date: date ?? undefined,
      slot: slot ?? undefined,
      remark: remark || undefined,
    };
    if (draft.serviceId || draft.staffId || draft.date || draft.remark) {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }
  }, [serviceId, staffId, date, slot, remark]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const apply = <T,>(set: (v: T) => void) => ({ data, error }: { data: T | null; error: { message: string } | null }) => {
      if (cancelled) return;
      if (error) {
        toast.error("加载可预约项目失败", { description: error.message });
        return;
      }
      set((data ?? []) as T);
    };

    q(() =>
      supabase.from("services").select("*").eq("is_active", true).order("sort_order")
    ).then(apply<Services[]>((v) => setServices(v)));
    q(() =>
      supabase.from("staff").select("*").eq("is_active", true).order("sort_order")
    ).then(apply<Staff[]>((v) => setStaffList(v)));
    q(() => supabase.from("staff_services").select("*")).then(
      apply<StaffServices[]>((v) => setStaffServices(v))
    );

    (async () => {
      // 关键：getUser 抛错也必须落到 authChecked，否则第 4 步永久卡在「正在检查贵宾会籍状态」
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: memberRow } = await q(() =>
            supabase.from("members").select("*").eq("user_id", user.id).maybeSingle()
          );
          if (!cancelled) setMember((memberRow as Members) ?? null);
        }
      } catch (e) {
        if (!cancelled) {
          setMember(null);
          toast.error("无法确认登录状态", {
            description: e instanceof Error ? e.message : "网络异常",
          });
        }
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!member || !serviceId) {
      setPasses([]);
      return;
    }
    let cancelled = false;
    // RLS 的 service_passes_select_own_or_admin 已限定只能读到自己那张
    q(() =>
      createClient()
        .from("service_passes")
        .select("id, title, expires_at")
        .eq("member_id", member.id)
        .eq("service_id", serviceId)
        .eq("status", "active")
        .order("expires_at", { ascending: true, nullsFirst: false })
    )
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error("会籍权益加载失败", { description: error.message });
          setPasses([]);
          return;
        }
        const now = Date.now();
        setPasses(
          ((data as { id: string; title: string; expires_at: string | null }[]) ?? []).filter(
            (p) => !p.expires_at || new Date(p.expires_at).getTime() > now
          )
        );
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        toast.error("会籍权益加载失败", {
          description: e instanceof Error ? e.message : "网络异常",
        });
        setPasses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [member, serviceId]);

  const service = useMemo(
    () => services?.find((s) => s.id === serviceId) ?? null,
    [services, serviceId]
  );

  const eligibleStaff = useMemo(() => {
    if (!staffList || !staffServices || !serviceId) return [];
    return staffList.filter((s) =>
      staffServices.some((ss) => ss.staff_id === s.id && ss.service_id === serviceId)
    );
  }, [staffList, staffServices, serviceId]);

  const staff = useMemo(
    () => staffList?.find((s) => s.id === staffId) ?? null,
    [staffList, staffId]
  );

  const [dateOptions, setDateOptions] = useState<Date[]>([]);
  useEffect(() => {
    const today = new Date();
    setDateOptions(
      Array.from({ length: BOOKING_DAYS_AHEAD }, (_, i) => addDays(today, i))
    );
  }, []);

  useEffect(() => {
    if (!serviceId || !staffId || !date) return;
    let cancelled = false;
    setSlotsLoading(true);
    setSlots(null);
    q(() =>
      createClient().rpc("get_available_slots", {
        p_staff_id: staffId,
        p_service_id: serviceId,
        p_date: date,
      })
    )
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error("获取可约时段失败", { description: error.message });
          setSlots([]);
        } else {
          setSlots((data as { slot_start: string }[]).map((r) => r.slot_start));
        }
        setSlotsLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        toast.error("获取可约时段失败", {
          description: e instanceof Error ? e.message : "网络异常",
        });
        setSlots([]);
        setSlotsLoading(false);
      });

    // 乱序守卫：快速切换技师/日期时，旧响应不得覆盖新选择的时段列表
    return () => {
      cancelled = true;
    };
  }, [serviceId, staffId, date]);

  const selectService = (id: string) => {
    setServiceId(id);
    setStaffId(null);
    setSlot(null);
  };

  const selectStaff = (id: string) => {
    setStaffId(id);
    setSlot(null);
  };

  const canNext =
    (step === 0 && Boolean(serviceId)) ||
    (step === 1 && Boolean(staffId)) ||
    (step === 2 && Boolean(slot)) ||
    step === 3;

  // 吸底栏上那行「已选了什么」：让顾客不必回头翻上面是否点中，
  // 也让「还没选」这件事无需靠置灰按钮去猜。
  const STEP_META: { picked: string | null; hint: string }[] = [
    { picked: service?.name ?? null, hint: "请先选定一个调理项目" },
    {
      picked: staff ? `${staff.name}${staff.title ? ` · ${staff.title}` : ""}` : null,
      hint: "请先指定一位专属技师",
    },
    {
      picked: slot ? formatDateTime(slot) : null,
      hint: date ? "请先选定一个到店时辰" : "请先选择到店日期",
    },
    { picked: null, hint: "" },
  ];
  const stepMeta = STEP_META[step];

  const submit = async () => {
    if (!member || !serviceId || !staffId || !slot) return;
    setSubmitting(true);
    const { data, error } = await createClient().rpc("create_appointment", {
      p_customer_id: member.id,
      p_staff_id: staffId,
      p_service_id: serviceId,
      p_start_time: slot,
      p_remark: remark || undefined,
      p_pass_id: passes[0]?.id,
    });
    setSubmitting(false);

    if (error) {
      toast.error("预约失败", { description: error.message });
      return;
    }
    sessionStorage.removeItem(DRAFT_KEY);
    setBookedId(data as string);
  };

  if (bookedId) {
    return (
      <div className="mx-auto max-w-lg">
        {/* 文人印章质感预约凭折 */}
        <div className="animate-in fade-in slide-in-from-bottom-4 overflow-hidden rounded-2xl border border-bronze-300/80 bg-gradient-to-b from-card via-paper to-card shadow-2xl shadow-bark-900/10 duration-500">
          {/* 折头顶栏 */}
          <div className="relative border-b border-dashed border-bronze-300/70 p-8 text-center">
            <span className="inline-block border border-bronze-600/70 bg-bronze-50/70 px-2.5 py-0.5 font-serif text-[11px] tracking-widest text-bronze-800">
              林梓精养馆 · 预约凭单
            </span>
            <h2 className="mt-4 font-serif text-3xl text-bark-800">
              预约已敬呈
            </h2>
            <p className="mt-2 font-mono text-xs tracking-widest text-bronze-700">
              单号 · LZ-{bookedId.slice(0, 8).toUpperCase()}
            </p>
            <p className="mt-3 text-xs text-bark-400">
              已录入店家调度系统 · 待掌柜接单确认
            </p>
          </div>

          {/* 核销信息细览 */}
          <div className="space-y-4 p-8 text-sm">
            <SummaryLine label="预约项目" value={service?.name ?? "—"} />
            <SummaryLine
              label="专属技师"
              value={`${staff?.name ?? "—"}${staff?.title ? `（${staff.title}）` : ""}`}
            />
            <SummaryLine label="到店时辰" value={formatDateTime(slot)} />
            <SummaryLine
              label="礼遇价格"
              value={
                passes.length > 0
                  ? `已核销会籍权益 · ${passes[0].title}（剩 ${passes.length - 1} 张）`
                  : service?.member_price != null
                    ? `${formatCNY(service.member_price)}（会员专享价 · 从会籍余额扣除）`
                    : `${formatCNY(service?.price ?? 0)} · 从会籍余额扣除`
              }
            />
          </div>

          {/* 手机系统提醒卡 */}
          <div className="space-y-4 border-t border-dashed border-bronze-300/70 bg-bronze-50/40 p-8">
            <div className="rounded-xl border border-bronze-200/90 bg-background/90 p-5 text-center">
              <span className="inline-block font-serif text-xs text-bronze-700">
                服务保障 · 到店提醒
              </span>
              <p className="mt-2 text-xs leading-relaxed text-bark-500">
                开启手机通知后，赴约前 2 小时将通过手机原生弹窗提醒，无需担心遗忘。
              </p>
              <div className="mt-4 flex justify-center">
                <PushNotificationButton userId={member?.user_id} size="sm" />
              </div>
            </div>

            <p className="text-center font-serif text-xs leading-relaxed text-bark-400">
              * 建议提前 10 分钟到店，品一杯香茗，静候调养。
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild className="bg-bronze-500 text-white hover:bg-bronze-600">
            <Link href="/my">查看我的预约</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">返回首页</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* 文人四步折页导航 */}
      <ol className="grid grid-cols-4 gap-2 sm:gap-4">
        {STEPS.map((s, i) => {
          const isCurrent = i === step;
          const isPassed = i < step;
          return (
            <li key={s.label}>
              <button
                type="button"
                onClick={() => isPassed && setStep(i)}
                disabled={!isPassed && !isCurrent}
                className={cn(
                  "group relative flex w-full flex-col rounded-xl border p-3 text-left transition-all duration-300 sm:p-4",
                  isCurrent && "border-bronze-500 bg-card shadow-md shadow-bronze-900/5 ring-1 ring-bronze-500",
                  isPassed && "border-border/80 bg-paper/60 hover:border-bronze-400",
                  !isCurrent && !isPassed && "border-border/40 bg-card/40 opacity-50"
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "font-serif text-xs",
                      isCurrent && "font-semibold text-bronze-700",
                      isPassed && "text-bark-500",
                      !isCurrent && !isPassed && "text-bark-300"
                    )}
                  >
                    第{s.order}步
                  </span>
                  {isPassed && (
                    <span className="flex size-4 items-center justify-center rounded-full bg-bronze-500 text-white">
                      <Check className="size-2.5" />
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "mt-1 font-serif text-sm sm:text-base",
                    isCurrent ? "text-bark-800" : "text-bark-600"
                  )}
                >
                  {s.label}
                </p>
                <p className="hidden text-[11px] text-bark-400 sm:block">
                  {s.desc}
                </p>
              </button>
            </li>
          );
        })}
      </ol>

      {/* 步骤内容册页 */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm md:p-10">
        <div key={step} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* 第一步：选择项目 */}
          {step === 0 && (
            <div>
              <StepHeading
                badge="壹 · 辨体择品"
                title="选择心仪调理项目"
                desc="每一项皆遵循传统手法，新客首单均按专享会员价计费"
              />
              {services === null ? (
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-32 rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="mt-10 grid gap-4 sm:grid-cols-2">
                  {services.map((s) => {
                    const active = serviceId === s.id;
                    return (
                      <Reveal key={s.id} className="h-full">
                        <button
                        type="button"
                        onClick={() => selectService(s.id)}
                        ref={s.id === deepLinkServiceId ? deepLinkRef : undefined}
                        className={cn(
                          "group relative flex h-full w-full flex-col rounded-xl border p-5 text-left transition-all duration-300",
                          active
                            ? "border-bronze-500 bg-bronze-50/40 shadow-sm ring-1 ring-bronze-500"
                            : "border-border/80 bg-background/60 hover:border-bronze-300 hover:bg-paper/50",
                          // 深链落地时脉冲一次，把「已为你选好」这件事显性化
                          s.id === deepLinkServiceId && "animate-[pulse_1.2s_ease-in-out_2]"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          {/* 项目名与品类角标分开两行：长名（如「姜汤头疗+头皮排污」）
                              在窄屏下会把角标挤到第二行贴左缘，与右侧价格列争抢宽度，
                              导致价格被压成窄条。拆成独立行后两者互不影响。 */}
                          <div className="min-w-0 flex-1">
                            <span className="block font-serif text-lg leading-snug text-bark-800 group-hover:text-bronze-800">
                              {s.name}
                            </span>
                            {s.category && (
                              <span className="mt-1.5 inline-block rounded-sm bg-secondary px-2 py-0.5 text-[10px] text-bark-500">
                                {s.category}
                              </span>
                            )}
                          </div>
                          <div className="shrink-0 whitespace-nowrap text-right">
                            {s.member_price != null ? (
                              <>
                                <span className="font-serif text-lg font-medium text-bronze-700">
                                  {formatCNY(s.member_price)}
                                </span>
                                <span className="ml-1 text-[10px] text-bronze-600/70">
                                  会员价
                                </span>
                                <span className="block text-[11px] text-bark-400">
                                  门市 {formatCNY(s.price)}
                                </span>
                              </>
                            ) : (
                              <span className="font-serif text-lg font-medium text-bronze-700">
                                {formatCNY(s.price)}
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="mt-2.5 line-clamp-2 flex-1 text-xs leading-relaxed text-bark-500">
                          {s.description ?? "详情请到店垂询。"}
                        </p>

                        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-bark-400">
                          <span className="flex items-center gap-1.5">
                            <Clock className="size-3 text-bronze-600" />
                            {formatDuration(s.duration)}
                          </span>
                          <span
                            className={cn(
                              "text-[11px] font-serif transition-colors",
                              active ? "text-bronze-700" : "text-bark-400"
                            )}
                          >
                            {active ? "● 已选定" : "点击选此项目"}
                          </span>
                        </div>
                        </button>
                      </Reveal>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 第二步：选择技师 */}
          {step === 1 && (
            <div>
              <StepHeading
                badge="贰 · 择定良工"
                title="选择专属调理技师"
                desc={`当前项目「${service?.name}」，以下技师均系统研习并熟稔此项手法`}
              />
              {staffList === null || staffServices === null ? (
                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-44 rounded-xl" />
                  ))}
                </div>
              ) : eligibleStaff.length === 0 ? (
                <p className="mt-8 rounded-xl bg-paper px-6 py-10 text-center font-serif text-sm text-bark-500">
                  此项目暂未排班专属技师，请退回上一步选择其他项目。
                </p>
              ) : (
                <div className="mt-8 grid gap-5 sm:grid-cols-3">
                  {eligibleStaff.map((s) => {
                    const active = staffId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => selectStaff(s.id)}
                        className={cn(
                          "group relative flex flex-col items-center rounded-xl border p-6 text-center transition-all duration-300",
                          active
                            ? "border-bronze-500 bg-bronze-50/40 shadow-sm ring-1 ring-bronze-500"
                            : "border-border/80 bg-background/60 hover:border-bronze-300 hover:bg-paper/50"
                        )}
                      >
                        <span className="flex size-14 items-center justify-center rounded-full border border-bronze-400/60 bg-gradient-to-br from-bark-700 to-bark-900 font-serif text-xl text-ivory shadow-sm">
                          {s.name.slice(0, 1)}
                        </span>
                        <h4 className="mt-4 font-serif text-lg text-bark-800">
                          {s.name}
                        </h4>
                        <span className="mt-1 rounded-sm bg-secondary px-2 py-0.5 text-[11px] text-bronze-700">
                          {s.title ?? "理疗技师"}
                        </span>
                        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-bark-500">
                          {s.bio ?? "秉持古法，手法纯熟静心。"}
                        </p>
                        <span
                          className={cn(
                            "mt-5 text-[11px] font-serif",
                            active ? "text-bronze-700 font-medium" : "text-bark-400"
                          )}
                        >
                          {active ? "● 已指定此技师" : "选择技师"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 第三步：选择时间 */}
          {step === 2 && (
            <div>
              <StepHeading
                badge="叁 · 顺时纳气"
                title="选择到店吉日与时辰"
                desc="为您留出沉静专注的排班空档，按30分钟步进精确安排"
              />

              {/* 日期选择横轴 */}
              <div className="mt-8 flex gap-2.5 overflow-x-auto pb-3">
                {dateOptions.map((d) => {
                  const key = dateKey(d);
                  const active = date === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setDate(key);
                        setSlot(null);
                      }}
                      className={cn(
                        "flex min-w-[72px] shrink-0 flex-col items-center rounded-xl border py-3 text-center transition-all duration-200",
                        active
                          ? "border-bronze-600 bg-bronze-600 text-ivory shadow-sm"
                          : "border-border/80 bg-background/80 text-bark-600 hover:border-bronze-400"
                      )}
                    >
                      <span className="text-[11px] opacity-80">{weekdayLabel(d)}</span>
                      <span className="mt-1 font-serif text-base font-medium">
                        {formatMD(d)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 可用时段网格 */}
              <div className="mt-8">
                {!date ? (
                  <p className="rounded-xl bg-paper px-6 py-10 text-center text-sm text-bark-400">
                    请先在上方横轴选择到店日期
                  </p>
                ) : slotsLoading ? (
                  <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <Skeleton key={i} className="h-11 rounded-lg" />
                    ))}
                  </div>
                ) : !slots || slots.length === 0 ? (
                  <p className="rounded-xl bg-paper px-6 py-10 text-center text-sm text-bark-400">
                    当日暂无合适排班空档，请移步尝试其他日期
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
                    {slots.map((iso) => {
                      const active = slot === iso;
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => setSlot(iso)}
                          className={cn(
                            "rounded-lg border py-2.5 font-mono text-sm transition-all duration-200",
                            active
                              ? "border-bronze-600 bg-bronze-600 font-medium text-ivory shadow-sm"
                              : "border-border/80 bg-background text-bark-700 hover:border-bronze-400"
                          )}
                        >
                          {formatTime(iso)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {slot && (
                <div className="mt-5 flex items-center gap-2 rounded-lg bg-bronze-50/60 px-4 py-2 text-xs text-bronze-800">
                  <Sparkles className="size-3.5 text-bronze-600" />
                  <span>{slotMoodLabel(slot)} · 预留静养时刻</span>
                </div>
              )}
            </div>
          )}

          {/* 第四步：确认预约 */}
          {step === 3 && (
            <div>
              <StepHeading
                badge="肆 · 慎始终如"
                title="核对并呈送预约"
                desc="请仔细核对您的预约信息，确认后将即时录入门店排班系统"
              />

              <div className="mt-8 rounded-xl border border-bronze-200/80 bg-gradient-to-br from-paper via-card to-bronze-50/40 p-6 md:p-8">
                <dl className="space-y-3.5 text-sm">
                  <SummaryLine
                    label="所选项目"
                    value={`${service?.name ?? "—"}（${formatDuration(service?.duration ?? 0)}）`}
                  />
                  <SummaryLine label="执操技师" value={staff?.name ?? "—"} />
                  <SummaryLine label="到店时间" value={formatDateTime(slot)} />
                  <SummaryLine
                    label="消费预估"
                    value={
                      service?.member_price != null
                        ? `${formatCNY(service.member_price)}（会员价 · 门市 ${formatCNY(service.price)}）`
                        : `${formatCNY(service?.price ?? 0)}（到店核销支付）`
                    }
                  />
                </dl>

                {service?.member_price != null && (
                  <p className="mt-4 border-t border-border/60 pt-3 text-xs text-bronze-700">
                    * 初次到店顾客同享会员体验价，线下结账时由掌柜核销并登记余额。
                  </p>
                )}

                <div className="mt-6 border-t border-border/60 pt-5">
                  <label htmlFor="remark" className="block text-xs font-medium text-bark-600">
                    养身嘱托 / 备注（身体状况、受力偏好等，选填）
                  </label>
                  <Textarea
                    id="remark"
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    placeholder="如：近来肩颈容易僵硬，偏好力度沉稳些；或对某类香气有偏好等。"
                    className="mt-2"
                    rows={3}
                    maxLength={200}
                  />
                </div>

                <div className="mt-8">
                  {!authChecked ? (
                    <p className="rounded-xl border border-dashed border-border/80 bg-paper/60 px-4 py-4 text-center text-xs text-bark-400">
                      正在核对贵宾会籍状态…
                    </p>
                  ) : !member ? (
                    <div className="rounded-xl border border-bronze-300 bg-background p-6 text-center">
                      <p className="font-serif text-base text-bark-800">
                        需要登录会籍以绑定您的预约
                      </p>
                      <p className="mt-1.5 text-xs text-bark-500">
                        本馆采用封闭制账号管理。已开户会员请直接登录，登录后自动返回并保留已选项。
                      </p>
                    </div>
                  ) : (
                    <p className="text-center text-xs text-bark-400">
                      核对无误后，点右下角「确认呈送」即录入门店排班。
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 吸底操作栏：四步共用一条。
            从前「下一步」是正文流里的最后一行，项目卡堆叠起来后它落在折叠线以下，
            顾客点完项目还要长滑到底才能继续，体感像"点了没反应"。
            改为吸附在视口底部后，无论页面多长、选完哪一项，下一步都随手可及。
            带半透明宣纸底 + 顶部发丝线，滚动时内容从底下穿过而不打架。 */}
        <div className="sticky bottom-0 z-30 -mx-6 mt-10 border-t border-border/70 bg-card/95 px-6 pb-4 pt-4 backdrop-blur-md md:-mx-10 md:px-10">
          <div className="flex items-center justify-between gap-3">
            {step > 0 ? (
              <Button
                variant="ghost"
                className="shrink-0"
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft className="size-4" /> 上一步
              </Button>
            ) : (
              <span className="text-[10px] tracking-widest text-bark-300">
                壹 / 肆
              </span>
            )}

            {/* 中段只放一行摘要：选了什么 / 还差什么 */}
            <p className="min-w-0 flex-1 text-center text-xs">
              {stepMeta.picked ? (
                <span className="text-bark-600">
                  <span className="text-bark-400">已选 · </span>
                  <span className="font-serif text-bronze-700">{stepMeta.picked}</span>
                </span>
              ) : (
                <span className="text-bark-400">{stepMeta.hint}</span>
              )}
            </p>

            {step < 3 ? (
              <Button
                disabled={!canNext}
                onClick={() => setStep(step + 1)}
                className="shrink-0 bg-bark-700 text-ivory hover:bg-bark-600"
              >
                下一步 <ArrowRight className="size-4" />
              </Button>
            ) : !authChecked ? (
              <span className="shrink-0 text-sm text-bark-400">
                正在核对会籍…
              </span>
            ) : !member ? (
              <Button
                className="shrink-0 bg-bronze-500 text-white hover:bg-bronze-600"
                onClick={() => router.push("/login?next=/book")}
              >
                <LogIn className="size-4" /> 登录会籍账号
              </Button>
            ) : (
              <Button
                disabled={submitting}
                onClick={submit}
                className="shrink-0 bg-bronze-500 text-white hover:bg-bronze-600"
              >
                <Check className="size-4" />
                {submitting ? "正在呈送…" : "确认呈送"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepHeading({ badge, title, desc }: { badge: string; title: string; desc: string }) {
  return (
    <div>
      <span className="inline-block border border-bronze-500/60 bg-bronze-50/50 px-2.5 py-0.5 font-serif text-[11px] tracking-widest text-bronze-800">
        {badge}
      </span>
      <h3 className="mt-3 font-serif text-2xl text-bark-800">{title}</h3>
      <p className="mt-1 text-xs text-bark-400">{desc}</p>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="shrink-0 text-bark-400">{label}</dt>
      <dd className="font-serif text-right text-bark-800">{value}</dd>
    </div>
  );
}
