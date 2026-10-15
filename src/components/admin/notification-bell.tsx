"use client";

import Link from "next/link";
import { Bell, CheckCheck, Hourglass, CalendarClock, MailWarning, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppointmentDialog } from "@/components/admin/appointment-dialog";
import { type InboxItem, type InboxState } from "@/lib/hooks";
import { adminGet } from "@/lib/admin/client";
import type { AppointmentWithRefs } from "@/lib/types";
import { cn } from "@/lib/utils";

/** 三类事项各自的图标与配色，保持与全站新中式色调一致 */
const KIND_META: Record<
  InboxItem["kind"],
  { icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  pending: { icon: Hourglass, tone: "text-amber-700" },
  delivery_failed: { icon: MailWarning, tone: "text-rose-600" },
  arrive_today: { icon: CalendarClock, tone: "text-sky-700" },
};

/**
 * 老板端通知中心（铃铛）。
 * 只呈现「需要老板动手」的事项；实时 Toast/推送之外的补漏入口。
 *
 * inbox 由 AdminShell 传入而非在此自取：同一个页面里铃铛出现在两处
 * （桌面侧边栏 / 手机顶栏），各自取数会重复请求聚合接口并重复订阅 Realtime。
 */
export function NotificationBell({ inbox }: { inbox: InboxState }) {
  const { items, unread, loading, markSeen } = inbox;
  const [open, setOpen] = useState(false);

  // 「点开直接办」：点待确认条目时，就地取回该单完整详情并弹出处理面板，
  // 而不是跳回仪表盘再让老板自己找。loadingId 让被点的那条显示转圈。
  const [opened, setOpened] = useState<AppointmentWithRefs | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const badge = unread && unread > 0 ? unread : 0;

  /**
   * 打开一条预约的处理面板。
   * 详情必须经服务端 admin 身份取：客户端会话若非 admin，members 关联会被
   * RLS 静默置空，弹窗里客户名就变成「匿名会员」。
   */
  const openAppointment = async (item: InboxItem) => {
    if (!item.appointmentId) return;
    setLoadingId(item.id);
    const res = await adminGet<{ appointment: AppointmentWithRefs | null }>(
      "/appointment",
      { id: item.appointmentId }
    );
    setLoadingId(null);
    const appt = res.data?.appointment ?? null;
    if (res.error || !appt) {
      toast.error("打不开这条预约", {
        description: res.error?.message ?? "该预约可能已被删除或改期",
      });
      return;
    }
    setOpen(false);
    setOpened(appt);
  };

  return (
    <>
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // 打开面板只把「看过就一定不需要再提醒」的那类标记为已读（见 hooks 的
        // markSeen）：待确认预约必须办完才消，否则瞟一眼就再也收不到提醒。
        if (next) markSeen();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={badge > 0 ? `通知中心，${badge} 条未读` : "通知中心"}
          className="relative text-bark-200 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <Bell className="size-4" />
          {badge > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 font-mono text-[10px] leading-none text-white">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="right"
        className="w-80 border-border/80 p-0"
      >
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="size-3.5 text-bronze-600" />
            <span className="font-serif text-sm text-bark-800">待办提醒</span>
          </div>
          <span className="text-[11px] text-bark-400">
            {loading ? "加载中…" : `${items.length} 项`}
          </span>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            <div className="h-10 animate-pulse rounded-md bg-secondary" />
            <div className="h-10 animate-pulse rounded-md bg-secondary" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
            <CheckCheck className="size-6 text-emerald-600" />
            <p className="font-serif text-sm text-bark-600">暂无待办事项</p>
            <p className="text-[11px] text-bark-400">
              收到新预约、有顾客到店时会在这里提醒你
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-80">
            <ul className="divide-y divide-border/60">
              {items.map((item) => {
                const meta = KIND_META[item.kind];
                const Icon = meta.icon;
                const isPending = item.kind === "pending";
                const busy = loadingId === item.id;

                const inner = (
                  <>
                    {busy ? (
                      <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-bronze-600" />
                    ) : (
                      <Icon className={cn("mt-0.5 size-4 shrink-0", meta.tone)} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-bark-800">
                        {item.title}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-bark-500">
                        {item.detail}
                      </p>
                    </div>
                    {isPending && (
                      <span className="mt-0.5 shrink-0 self-center rounded-full bg-bronze-50 px-2 py-0.5 text-[10px] text-bronze-700">
                        去处理
                      </span>
                    )}
                  </>
                );

                // 待确认预约：就地打开处理面板，省掉「跳回仪表盘再自己找」那一步。
                // 其余两类（到店提醒、投递失败）本就在仪表盘上有对应区域，保持跳转。
                return (
                  <li key={item.id}>
                    {isPending ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void openAppointment(item)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-paper/60 disabled:opacity-70"
                      >
                        {inner}
                      </button>
                    ) : (
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-paper/60"
                      >
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>

    {/* 处理面板挂在铃铛自己身上：老板在任意管理页都能直接从通知中心办单，
        不必先跳到仪表盘。办完刷新待办列表，该条会因状态离开 pending 而消失。 */}
    <AppointmentDialog
      appointment={opened}
      onOpenChange={(next) => !next && setOpened(null)}
      onChanged={() => {
        setOpened(null);
        inbox.refresh();
      }}
    />
    </>
  );
}
