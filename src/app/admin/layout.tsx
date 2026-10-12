import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { PageLoader } from "@/components/brand";
import { RealtimeNotifier } from "@/components/admin/realtime-notifier";
import { AdminShell } from "@/components/admin/admin-shell";
import { getCurrentSession } from "@/lib/auth-server";
import { ServiceUnavailable } from "@/components/service-unavailable";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <AdminGuard>{children}</AdminGuard>
    </Suspense>
  );
}

async function AdminGuard({ children }: { children: React.ReactNode }) {
  await connection();
  const session = await getCurrentSession();
  if (session.status === "unavailable") return <ServiceUnavailable retryHref="/admin" />;
  const { role } = session;
  if (role !== "admin") {
    redirect(
      role === "staff" ? "/staff" : role === "customer" ? "/my" : "/login?next=/admin"
    );
  }

  return (
    <AdminShell>
      {children}
      <RealtimeNotifier />
    </AdminShell>
  );
}
