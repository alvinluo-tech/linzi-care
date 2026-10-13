import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/dal";


/**
 * GET /api/admin/schedules?staff_id=<uuid>&from=<iso>&to=<iso>
 * 排班设置：技师列表 + 指定技师在区间内的排班时段。
 */
export async function GET(request: Request) {
  const check = await requireAdmin();
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { searchParams } = new URL(request.url);
  const staffId = searchParams.get("staff_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const staffRes = await check.supabase
    .from("staff")
    .select("*")
    .order("sort_order");
  if (staffRes.error) {
    return NextResponse.json({ error: staffRes.error.message }, { status: 500 });
  }

  let schedules: unknown[] = [];
  if (staffId) {
    let schedQuery = check.supabase
      .from("schedules")
      .select("*")
      .eq("staff_id", staffId)
      .order("start_time");
    if (from) schedQuery = schedQuery.gte("start_time", from);
    if (to) schedQuery = schedQuery.lt("start_time", to);
    const schedRes = await schedQuery;
    if (schedRes.error) {
      return NextResponse.json({ error: schedRes.error.message }, { status: 500 });
    }
    schedules = schedRes.data ?? [];
  }

  return NextResponse.json({ staff: staffRes.data ?? [], schedules });
}

// 注意：不要给这里加 export const dynamic / revalidate 等 route segment config。
// 项目开启了 nextConfig.cacheComponents，这类配置会直接让构建失败；而身份核验
// 会读 cookie，本身就保证按请求执行，管理端数据不会被预渲染进构建产物。
