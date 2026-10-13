import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/dal";


/**
 * GET /api/admin/reports?from=<iso>&to=<iso>
 * 报表数据：区间内预约 + 服务项目 + 技师 + 会员（用于统计与留存）。
 */
export async function GET(request: Request) {
  const check = await requireAdmin();
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let aptQuery = check.supabase
    .from("appointments")
    .select("*, price_snapshot, member_price_snapshot, services(name, price, member_price)")
    .order("start_time")
    .limit(5000);
  if (from) aptQuery = aptQuery.gte("start_time", from);
  if (to) aptQuery = aptQuery.lt("start_time", to);

  const [aptRes, servicesRes, staffRes, membersRes] = await Promise.all([
    aptQuery,
    check.supabase.from("services").select("id, name, price, member_price"),
    check.supabase.from("staff").select("id, name"),
    check.supabase.from("members").select("id, created_at, balance"),
  ]);

  const failed = [aptRes, servicesRes, staffRes, membersRes].find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({
    appointments: aptRes.data ?? [],
    services: servicesRes.data ?? [],
    staff: staffRes.data ?? [],
    members: membersRes.data ?? [],
  });
}

// 注意：不要给这里加 export const dynamic / revalidate 等 route segment config。
// 项目开启了 nextConfig.cacheComponents，这类配置会直接让构建失败；而身份核验
// 会读 cookie，本身就保证按请求执行，管理端数据不会被预渲染进构建产物。
