import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageLoader } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { getCurrentSession } from "@/lib/auth-server";
import { roleHome } from "@/lib/constants";

export const metadata: Metadata = { title: "登录" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 md:py-24">
      <Suspense fallback={<PageLoader />}>
        <LoginGate searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const REASON_HINTS: Record<string, string> = {
  "session-expired": "登录状态已失效，请重新登录后继续之前的操作。",
};

async function LoginGate({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  await connection();
  const session = await getCurrentSession();
  // 已登录就按角色送回家，别让用户再填一遍账号
  if (session.role) redirect(roleHome(session.role));
  const hint = reason ? REASON_HINTS[reason] : undefined;

  return (
    <div className="space-y-3">
      {hint && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
          {hint}
        </p>
      )}
      <LoginForm />
    </div>
  );
}
