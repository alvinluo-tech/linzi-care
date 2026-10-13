import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/dal";


/** GET /api/admin/balance-logs?member_id=<uuid>&limit=<n> —— 会员余额变动流水 */
export async function GET(request: Request) {
  const check = await requireAdmin();
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get("member_id");
  if (!memberId) {
    return NextResponse.json({ error: "缺少 member_id 参数" }, { status: 400 });
  }
  const limit = Math.min(Number(searchParams.get("limit") ?? 30) || 30, 200);

  const { data, error } = await check.supabase
    .from("balance_logs")
    .select("*")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ logs: data ?? [] });
}

// 注意：不要给这里加 export const dynamic / revalidate 等 route segment config。
// 项目开启了 nextConfig.cacheComponents，这类配置会直接让构建失败；而身份核验
// 会读 cookie，本身就保证按请求执行，管理端数据不会被预渲染进构建产物。
