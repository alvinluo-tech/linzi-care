import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { PageLoader } from "@/components/brand";
import { getCurrentSession } from "@/lib/auth-server";

export default function MyLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <MyGuard>{children}</MyGuard>
    </Suspense>
  );
}

async function MyGuard({ children }: { children: React.ReactNode }) {
  await connection();
  const { role } = await getCurrentSession();
  if (!role) redirect("/login?next=/my");
  if (role === "admin") redirect("/admin");
  if (role === "staff") redirect("/staff");
  return <>{children}</>;
}
