"use client";

import Link from "next/link";
import { Bell, CheckCheck, Hourglass, CalendarClock, MailWarning } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useInbox, type InboxItem } from "@/lib/hooks";
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
 */
export function NotificationBell() {
  const { items, unread, loading, markAllSeen } = useInbox();
  const [open, setOpen] = useState(false);

  const badge = unread && unread > 0 ? unread : 0;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // 打开面板即视为已读：老板已经看到了
        if (next && badge > 0) markAllSeen();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={badge > 0 ? `通知中心，${badge} 条未读` : "通知中心"}
          className="relative text-bark-300 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
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
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-paper/60"
                    >
                      <Icon className={cn("mt-0.5 size-4 shrink-0", meta.tone)} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-bark-800">
                          {item.title}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-bark-500">
                          {item.detail}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
