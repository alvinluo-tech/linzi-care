import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageLoader } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { getCurrentSession } from "@/lib/auth-server";
import { roleHome } from "@/lib/constants";

export const metadata: Metadata = { title: "登录" };

export default function LoginPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 md:py-24">
      <Suspense fallback={<PageLoader />}>
        <LoginGate />
      </Suspense>
    </div>
  );
}

async function LoginGate() {
  await connection();
  const { role } = await getCurrentSession();
  if (role) redirect(roleHome(role));
  return <LoginForm />;
}
