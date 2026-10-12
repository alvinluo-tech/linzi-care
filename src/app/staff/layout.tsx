import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { PageLoader } from "@/components/brand";
import { getCurrentSession } from "@/lib/auth-server";
import { ServiceUnavailable } from "@/components/service-unavailable";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <StaffGuard>{children}</StaffGuard>
    </Suspense>
  );
}

async function StaffGuard({ children }: { children: React.ReactNode }) {
  await connection();
  const session = await getCurrentSession();
  if (session.status === "unavailable") return <ServiceUnavailable retryHref="/staff" />;
  const { role } = session;
  if (role === "admin") redirect("/admin");
  if (role !== "staff") redirect("/login?next=/staff");
  return <>{children}</>;
}
