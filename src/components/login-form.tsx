"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Clock3, X } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { q } from "@/lib/supabase/query";
import {
  forgetAccount,
  loadRememberedAccounts,
  rememberAccount,
  type RememberedAccount,
} from "@/lib/login-accounts";
import { getKeepLogin, markSessionOnly, setKeepLogin } from "@/lib/session-preference";
import { roleHome, STORE_NAME } from "@/lib/constants";
import type { Role } from "@/lib/constants";

/**
 * 只接受站内路径：`//evil.com` 与 `/\\evil.com` 都会被浏览器当成跨域目标，
 * 直接放行等于开放重定向。
 */
function safeNextTarget(raw: string | null): string | null {
  if (!raw || raw.length < 2) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /**
   * 历史账号与「保持登录」偏好来自 localStorage。
   *
   * **必须留在 effect 里，不能用惰性初始化器**：服务端读到的是默认值
   * （无 window → [] 与 true），而客户端读到的可能是用户真实存过的值
   * （例如上次登录取消勾选「保持登录」，localStorage 里就是 "0"）。
   * 两者不同 → 服务端 HTML 与客户端首帧不一致 → React #418 水合失败。
   * 这个坑实测踩过：改成惰性初始化后 01-access 的多角色跳转用例稳定报 #418。
   *
   * 代价是「芯片首帧为空、下一帧出现」的轻微抖动，但正确性优先。
   */
  const [keepLogin, setKeepLoginState] = useState(true);
  const [accounts, setAccounts] = useState<RememberedAccount[]>([]);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage 只能在客户端读；放进惰性初始化器会导致服务端/客户端首帧不一致（实测 React #418） */
    setAccounts(loadRememberedAccounts());
    setKeepLoginState(getKeepLogin());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const toggleKeepLogin = (next: boolean) => {
    setKeepLoginState(next);
    setKeepLogin(next);
    markSessionOnly(!next);
  };

  /** 点历史账号：回填邮箱并把焦点交给密码框（密码永不回填） */
  const fillAccount = (acct: RememberedAccount) => {
    setEmail(acct.email);
    passwordRef.current?.focus();
  };

  const removeAccount = (emailToRemove: string) => {
    forgetAccount(emailToRemove);
    setAccounts(loadRememberedAccounts());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error || !data.user) {
      setSubmitting(false);
      toast.error("登录失败", {
        description:
          error?.message === "Invalid login credentials"
            ? "邮箱或密码不正确，请重试"
            : error?.message ?? "请稍后再试",
      });
      return;
    }

    const { data: rolesData, error: rolesError } = await q(() =>
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
    );

    if (rolesError) {
      // 角色读不出来不等于「是顾客」：那样会把老板落到会员区
      setSubmitting(false);
      toast.error("已登录，但暂时无法确认你的身份权限", {
        description: rolesError.message,
      });
      return;
    }

    // 登录成功后再记账号：失败/打错的邮箱不该留在历史里
    if (keepLogin) {
      rememberAccount(data.user.email ?? email.trim());
      markSessionOnly(false);
    } else {
      // 取消勾选：本次不记历史、且标记关页即登出
      markSessionOnly(true);
    }

    const roles = (rolesData ?? []).map((r) => r.role as string);
    const role: Role = roles.includes("admin")
      ? "admin"
      : roles.includes("staff")
        ? "staff"
        : "customer";

    router.replace(safeNextTarget(searchParams.get("next")) ?? roleHome(role));
  };

  const recentAccounts = useMemo(() => accounts.slice(0, 3), [accounts]);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="items-center text-center">
        <BrandMark className="mx-auto size-12 text-bark-700" />
        <CardTitle className="mt-2 font-serif text-2xl">
          欢迎回来
        </CardTitle>
        <CardDescription>{STORE_NAME} · 会员与员工登录入口</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          {recentAccounts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-bark-400">
                <Clock3 className="size-3" />
                最近登录
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentAccounts.map((acct) => (
                  <span
                    key={acct.email}
                    className="group inline-flex items-center gap-1 rounded-full border border-border bg-paper/70 py-1 pl-3 pr-1.5 text-xs text-bark-600 transition-colors hover:border-bronze-300"
                  >
                    <button
                      type="button"
                      onClick={() => fillAccount(acct)}
                      className="max-w-[13rem] truncate"
                      title={acct.email}
                    >
                      {acct.email}
                    </button>
                    <button
                      type="button"
                      aria-label={`移除 ${acct.email}`}
                      onClick={() => removeAccount(acct.email)}
                      className="rounded-full p-0.5 text-bark-300 hover:bg-secondary hover:text-bark-600"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              ref={passwordRef}
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-bark-500">
            <input
              type="checkbox"
              checked={keepLogin}
              onChange={(e) => toggleKeepLogin(e.target.checked)}
              className="size-3.5 accent-bronze-500"
            />
            保持登录状态（共用设备请取消勾选，关闭页面即自动登出）
          </label>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-bronze-500 text-white hover:bg-bronze-600"
          >
            {submitting ? "登录中…" : "登 录"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        <Separator />
        <p className="text-center text-xs leading-relaxed text-bark-400">
          本系统采用分配制账号，不开放公开注册。
          <br />
          出于安全考虑，密码不会被本站保存，如需自动填充可使用浏览器自带的密码管理器。
        </p>
        <Link href="/" className="text-xs text-bark-500 hover:text-bronze-600">
          返回首页
        </Link>
      </CardFooter>
    </Card>
  );
}
