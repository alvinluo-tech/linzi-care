"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  ChartColumnBig,
  Globe,
  Hourglass,
  LayoutDashboard,
  LogOut,
  Menu,
  ShoppingBag,
  Sparkles,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BrandMark } from "@/components/brand";
import { NotificationBell } from "@/components/admin/notification-bell";
import { usePendingCount } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { STORE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "仪表盘", icon: LayoutDashboard, exact: true },
  { href: "/admin/calendar", label: "预约日历", icon: CalendarDays },
  { href: "/admin/staff", label: "员工管理", icon: UsersRound },
  { href: "/admin/members", label: "会员管理", icon: UserRoundCog },
  { href: "/admin/services", label: "服务项目", icon: Sparkles },
  { href: "/admin/products", label: "商品管理", icon: ShoppingBag },
  { href: "/admin/schedule", label: "排班设置", icon: CalendarClock },
  { href: "/admin/reports", label: "基础报表", icon: ChartColumnBig },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pendingCount = usePendingCount();

  return (
    <div className="min-h-svh">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <SideContent pendingCount={pendingCount} />
      </aside>

      <div className="flex min-h-svh min-w-0 flex-col md:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="打开菜单">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-64 border-0 bg-sidebar p-0 text-sidebar-foreground"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>管理端导航</SheetTitle>
              </SheetHeader>
              <SideContent
                pendingCount={pendingCount}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <span className="font-serif tracking-widest">林梓精养馆 · 管理端</span>
          <div className="ml-auto flex items-center gap-1.5">
            {/* 接单是老板手机端最高频的动作，而侧边抽屉里的入口藏在
                「仪表盘」那一项的角标上 —— 得先想到开菜单、再知道角标在
                哪一项、进去还要从六张统计卡里找专区，全程五六步。
                这里直接把数字摆到顶栏，点一下直达接单专区。 */}
            {pendingCount !== null && pendingCount > 0 && (
              <Link
                href="/admin#pending-panel"
                aria-label={`${pendingCount} 单待确认，前往接单`}
                className="flex h-7 items-center gap-1 rounded-full bg-amber-500 px-2.5 font-mono text-xs leading-none text-white shadow-xs transition-colors hover:bg-amber-600"
              >
                <Hourglass className="size-3.5" />
                {pendingCount} 单待接
              </Link>
            )}
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

function SideContent({
  onNavigate,
  pendingCount,
}: {
  onNavigate?: () => void;
  pendingCount: number | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (item: (typeof NAV_ITEMS)[number]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push("/");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <BrandMark className="size-9 shrink-0 text-bronze-300" />
        <div className="leading-tight">
          <p className="font-serif text-base tracking-widest">{STORE_NAME}</p>
          <p className="text-[10px] tracking-[0.25em] text-bark-300">
            ADMIN CONSOLE
          </p>
        </div>
        <div className="ml-auto">
          <NotificationBell />
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              isActive(item)
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-bark-200 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon
              className={cn(
                "size-4",
                isActive(item) ? "text-bronze-300" : "text-bark-300"
              )}
            />
            {item.label}
            {item.href === "/admin" &&
              pendingCount !== null &&
              pendingCount > 0 && (
                <span
                  aria-label={`${pendingCount} 单待确认`}
                  className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-bronze-500 px-1.5 font-mono text-[11px] leading-none text-white"
                >
                  {pendingCount}
                </span>
              )}
          </Link>
        ))}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border px-3 py-4">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="w-full justify-start text-bark-200 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <Link href="/" target="_blank">
            <Globe /> 查看前台
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-bark-200 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <LogOut /> 退出登录
        </Button>
      </div>
    </div>
  );
}
