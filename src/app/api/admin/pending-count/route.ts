import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/dal";


/** GET /api/admin/pending-count —— 待确认预约数（导航角标） */
export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { count, error } = await check.supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ count: count ?? 0 });
}

// 注意：不要给这里加 export const dynamic / revalidate 等 route segment config。
// 项目开启了 nextConfig.cacheComponents，这类配置会直接让构建失败；而身份核验
// 会读 cookie，本身就保证按请求执行，管理端数据不会被预渲染进构建产物。
