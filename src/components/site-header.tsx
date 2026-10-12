"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarPlus, LogOut, Menu, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BrandMark, SealMark } from "@/components/brand";
import { useAuth } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { roleHome, STORE_NAME, STORE_TAGLINE } from "@/lib/constants";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "首页", seal: "序" },
  { href: "/services", label: "服务项目", seal: "目" },
  { href: "/book", label: "预约体验", seal: "约" },
  { href: "/shop", label: "颐养商城", seal: "物" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, user, role } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const signOut = async () => {
    await createClient().auth.signOut();
    setMobileOpen(false);
    router.push("/");
  };

  const nav = (
    <>
      {NAV_LINKS.map((link) => {
        const active = isActive(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "group relative rounded-full px-4 py-2 text-xs tracking-wider transition-all duration-300",
              active
                ? "font-serif font-medium text-bronze-700 bg-bronze-50/70"
                : "text-bark-600 hover:text-bronze-700 hover:bg-paper/80"
            )}
          >
            <span>{link.label}</span>
            {active && (
              <span className="absolute bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-bronze-500" />
            )}
          </Link>
        );
      })}
    </>
  );

  const authArea = loading ? (
    <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
  ) : user ? (
    <>
      <Button asChild variant="ghost" size="sm" className="text-xs">
        <Link href={roleHome(role)}>
          <UserRound className="size-3.5" /> 我的中心
        </Link>
      </Button>
      <Button variant="outline" size="sm" onClick={signOut} className="text-xs">
        <LogOut className="size-3.5" /> 退出
      </Button>
    </>
  ) : (
    <>
      <Button asChild variant="ghost" size="sm" className="text-xs">
        <Link href="/login">登录</Link>
      </Button>
      <Button
        asChild
        size="sm"
        className="bg-bronze-500 text-white shadow-xs hover:bg-bronze-600 text-xs"
      >
        <Link href="/book">
          <CalendarPlus className="size-3.5" /> 预约体验
        </Link>
      </Button>
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-3 text-bark-800 transition-opacity hover:opacity-90">
          <BrandMark className="size-9 shrink-0 text-bronze-600" />
          <div className="leading-tight">
            <span className="block font-serif text-lg font-semibold tracking-widest">
              {STORE_NAME}
            </span>
            <span className="block text-[10px] tracking-[0.3em] text-bark-400">
              LINZI WELLNESS · 新塘国贸汇
            </span>
          </div>
        </Link>

        <nav className="hidden items-center gap-1.5 md:flex">{nav}</nav>

        <div className="hidden items-center gap-2 md:flex">{authArea}</div>

        <div className="flex items-center gap-2 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="打开菜单">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 bg-card p-6">
              <SheetHeader className="text-left">
                <div className="flex items-center gap-2.5">
                  <BrandMark className="size-8 text-bronze-600" />
                  <SheetTitle className="font-serif tracking-widest text-bark-800">
                    {STORE_NAME}
                  </SheetTitle>
                </div>
                <p className="mt-1 text-[11px] text-bark-400 font-serif">
                  {STORE_TAGLINE}
                </p>
              </SheetHeader>
              <div className="my-6 h-px bg-border/70" />
              <nav className="flex flex-col gap-2">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors",
                      isActive(link.href)
                        ? "bg-bronze-50/70 font-medium text-bronze-700"
                        : "text-bark-600 hover:bg-paper"
                    )}
                  >
                    <span>{link.label}</span>
                    <SealMark text={link.seal} className="scale-75" />
                  </Link>
                ))}
              </nav>
              <div className="mt-8 flex flex-col gap-2.5 border-t border-border/70 pt-6">
                {authArea}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
