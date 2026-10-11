"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
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
import { roleHome, STORE_NAME } from "@/lib/constants";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);

    const roles = (rolesData ?? []).map((r) => r.role as string);
    const role = roles.includes("admin")
      ? "admin"
      : roles.includes("staff")
        ? "staff"
        : "customer";

    const next = searchParams.get("next");
    router.replace(next && next.startsWith("/") ? next : roleHome(role));
    router.refresh();
  };

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
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
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
          如需开通会员或员工账号，请联系店家办理。
        </p>
        <Link href="/" className="text-xs text-bark-500 hover:text-bronze-600">
          返回首页
        </Link>
      </CardFooter>
    </Card>
  );
}
