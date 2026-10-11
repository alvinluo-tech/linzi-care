"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarX2, History, Sparkles, UserRound, Wallet } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageLoader, SealMark } from "@/components/brand";
import { StatusBadge } from "@/components/status-badge";
import { MemberPassportCard } from "@/components/member-passport-card";
import { createClient } from "@/lib/supabase/client";
import {
  formatCNY,
  formatDateTime,
  formatTime,
} from "@/lib/format";
import type { Appointments, BalanceLogs, Members } from "@/lib/types";
import { PushNotificationButton } from "@/components/pwa/push-notification-button";

interface AppointmentRow extends Appointments {
  staff: { name: string } | null;
  services: { name: string; duration: number } | null;
}

export default function MyPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<Members | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [balanceLogs, setBalanceLogs] = useState<BalanceLogs[]>([]);
  const [now, setNow] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<AppointmentRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const loadAll = useCallback(async () => {
    setNow(Date.now());
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login?next=/my");
      return;
    }

    const { data: memberRow } = await supabase
      .from("members")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const m = (memberRow as Members) ?? null;
    setMember(m);
    if (m) {
      setName(m.name);
      setPhone(m.phone ?? "");
      supabase
        .from("balance_logs")
        .select("*")
        .eq("member_id", m.id)
        .order("created_at", { ascending: false })
        .limit(30)
        .then(({ data }) => setBalanceLogs((data as BalanceLogs[]) ?? []));
    }

    supabase
      .from("appointments")
      .select("*, staff(name), services(name, duration)")
      .order("start_time", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setAppointments((data as AppointmentRow[]) ?? []);
        setLoading(false);
      });
  }, [router]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const cancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    const { error } = await createClient().rpc("cancel_appointment", {
      p_appointment_id: cancelTarget.id,
    });
    setCancelling(false);
    if (error) {
      toast.error("取消失败", { description: error.message });
      return;
    }
    toast.success("预约已取消");
    setCancelTarget(null);
    loadAll();
  };

  const saveProfile = async () => {
    if (!member) return;
    setSavingProfile(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("members")
      .update({ name: name.trim() || member.name, phone: phone.trim() || null })
      .eq("id", member.id);
    await supabase
      .from("profiles")
      .update({ display_name: name.trim() || member.name, phone: phone.trim() || null })
      .eq("id", member.user_id ?? "");
    setSavingProfile(false);
    if (error) {
      toast.error("保存失败", { description: error.message });
      return;
    }
    toast.success("资料已更新");
    loadAll();
  };

  if (loading) {
    return <PageLoader />;
  }

  if (!member) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center md:px-6">
        <SealMark text="会籍" className="mx-auto" />
        <h1 className="mt-4 font-serif text-2xl text-bark-800">
          账号尚未关联会员档案
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-bark-500">
          当前登录账号还没有会员档案，请联系店家为您开通会员资格。
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={async () => {
            await createClient().auth.signOut();
            router.push("/");
          }}
        >
          退出登录
        </Button>
      </div>
    );
  }

  const upcoming =
    now === null
      ? []
      : appointments
          .filter(
            (a) =>
              new Date(a.start_time).getTime() > now - 60 * 60 * 1000 &&
              ["pending", "confirmed", "arrived"].includes(a.status)
          )
          .reverse();
  const history = appointments.filter((a) => !upcoming.includes(a));

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-20">
      {/* 贵宾会籍手卷顶栏 */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <SealMark text="贵宾" />
          <div>
            <h1 className="font-serif text-3xl text-bark-800">
              {member.name} · 会籍档案
            </h1>
            <p className="mt-1 text-xs text-bark-400">
              林梓精养馆 · 会员专属理疗资产与预约调度
            </p>
          </div>
        </div>

        {/* 护照式雅致会籍卡 */}
        <MemberPassportCard
          name={member.name}
          memberId={member.id}
          balance={Number(member.balance)}
        />

        {/* 手机系统推送开启栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bronze-200/80 bg-bronze-50/50 p-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="size-4 text-bronze-600" />
            <p className="text-xs text-bark-600">
              开启系统提醒后，预约前 2 小时将通过手机原生横幅通知您。
            </p>
          </div>
          <PushNotificationButton userId={member.user_id} size="sm" />
        </div>
      </div>

      {/* 雅致册页 Tabs */}
      <Tabs defaultValue="appointments" className="mt-12">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="appointments">预约手卷</TabsTrigger>
          <TabsTrigger value="balance">资产变动</TabsTrigger>
          <TabsTrigger value="profile">修撰资料</TabsTrigger>
        </TabsList>

        {/* 我的预约 */}
        <TabsContent value="appointments" className="mt-8 space-y-10">
          <section>
            <div className="flex items-center gap-2 border-b border-border/70 pb-3">
              <span className="size-1.5 rotate-45 bg-bronze-600" />
              <h2 className="font-serif text-base text-bark-800">即将赴约</h2>
            </div>
            {upcoming.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-border bg-card/40 px-4 py-10 text-center text-sm text-bark-400">
                暂无即将赴约的排班，
                <a href="/book" className="text-bronze-700 underline underline-offset-4">
                  挑选时段预约
                </a>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {upcoming.map((a) => (
                  <AppointmentCard key={a.id} row={a} now={now} onCancel={() => setCancelTarget(a)} />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 border-b border-border/70 pb-3">
              <span className="size-1.5 rotate-45 bg-bark-400" />
              <h2 className="font-serif text-base text-bark-800">历史足迹</h2>
            </div>
            {history.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-border bg-card/40 px-4 py-10 text-center text-sm text-bark-400">
                暂无历史记录
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {history.map((a) => (
                  <AppointmentCard key={a.id} row={a} now={now} />
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        {/* 资产变动审计表 */}
        <TabsContent value="balance" className="mt-8">
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
            <div className="border-b border-border/70 bg-paper/60 px-5 py-3">
              <p className="font-serif text-xs text-bark-600">
                收支审计账折 · 每一笔变动皆由掌柜经手核对
              </p>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 bg-secondary/30 text-left text-xs text-bark-500">
                <tr>
                  <th className="px-5 py-3.5 font-normal">日期时辰</th>
                  <th className="px-5 py-3.5 font-normal">事由名目</th>
                  <th className="px-5 py-3.5 text-right font-normal">资金变动</th>
                  <th className="px-5 py-3.5 text-right font-normal">当时结余</th>
                </tr>
              </thead>
              <tbody>
                {balanceLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-xs text-bark-400">
                      暂无账目变动记录
                    </td>
                  </tr>
                ) : (
                  balanceLogs.map((log) => (
                    <tr key={log.id} className="border-t border-border/60 transition-colors hover:bg-paper/40">
                      <td className="px-5 py-3.5 text-xs text-bark-600">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-5 py-3.5 font-serif text-sm text-bark-700">
                        {log.reason}
                      </td>
                      <td
                        className={`px-5 py-3.5 text-right font-mono text-sm font-medium ${
                          log.delta >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {log.delta >= 0 ? "+" : ""}
                        {formatCNY(log.delta)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-sm text-bark-800">
                        {formatCNY(log.new_balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3.5 text-xs text-bark-400">
            * 会员余额由店家在线下收付款后手动录入系统；受数据库级权威触发器保护，任何直接越权篡改均会被强制拦截。
          </p>
        </TabsContent>

        {/* 个人资料 */}
        <TabsContent value="profile" className="mt-8">
          <div className="max-w-md rounded-2xl border border-border/80 bg-card p-7 shadow-sm">
            <h3 className="flex items-center gap-2 font-serif text-lg text-bark-800">
              <UserRound className="size-4 text-bronze-600" /> 修撰会籍资料
            </h3>
            <p className="mt-1 text-xs text-bark-400">
              维护您的姓名与手机号，便于技师排班与到店接待
            </p>

            <div className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs text-bark-600">贵宾姓名</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs text-bark-600">联系电话</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="用于到店识别"
                  className="bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-bark-600">登录凭据邮箱（系统绑定，不可修改）</Label>
                <Input readOnly value={member.email ?? "—"} className="bg-muted font-mono text-xs text-bark-500" />
              </div>
              <Button
                onClick={saveProfile}
                disabled={savingProfile}
                className="mt-2 w-full bg-bark-700 text-ivory hover:bg-bark-600"
              >
                {savingProfile ? "保存中…" : "保存修撰资料"}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* 取消确认弹窗 */}
      <Dialog open={Boolean(cancelTarget)} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">撤回预约</DialogTitle>
            <DialogDescription>
              确定取消「{cancelTarget?.services?.name} ·{" "}
              {formatDateTime(cancelTarget?.start_time)}」的预约吗？取消后该排班将重新释放。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              再想想
            </Button>
            <Button variant="destructive" onClick={cancel} disabled={cancelling}>
              {cancelling ? "正在取消…" : "确认取消"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AppointmentCard({
  row,
  now,
  onCancel,
}: {
  row: AppointmentRow;
  now: number | null;
  onCancel?: () => void;
}) {
  const cancellable =
    ["pending", "confirmed"].includes(row.status) &&
    new Date(row.start_time).getTime() > (now ?? Infinity);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-5 shadow-sm transition-all duration-300 hover:border-bronze-300">
      <div>
        <div className="flex items-center gap-2.5">
          <h4 className="font-serif text-lg text-bark-800">
            {row.services?.name ?? "理疗项目"}
          </h4>
          <StatusBadge status={row.status} />
        </div>
        <p className="mt-1.5 text-xs text-bark-500">
          时辰：{formatDateTime(row.start_time)} – {formatTime(row.end_time)} · 执操技师：{row.staff?.name ?? "—"}
        </p>
      </div>
      {cancellable && onCancel && (
        <Button variant="outline" size="sm" onClick={onCancel} className="text-xs">
          <CalendarX2 className="size-3.5" /> 撤回预约
        </Button>
      )}
    </div>
  );
}
