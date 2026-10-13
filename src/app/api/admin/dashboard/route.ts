import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/dal";


/**
 * GET /api/admin/dashboard?day_start=<iso>&day_end=<iso>&month_start=<iso>
 * 仪表盘汇总：今日预约、待确认预约、本月已完成（含价格快照）、会员数/余额。
 */
export async function GET(request: Request) {
  const check = await requireAdmin();
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { searchParams } = new URL(request.url);
  const dayStart = searchParams.get("day_start");
  const dayEnd = searchParams.get("day_end");
  const monthStart = searchParams.get("month_start");
  if (!dayStart || !dayEnd || !monthStart) {
    return NextResponse.json(
      { error: "缺少 day_start / day_end / month_start 参数" },
      { status: 400 }
    );
  }

  const [todayRes, pendingRes, doneRes, membersRes] = await Promise.all([
    check.supabase
      .from("appointments")
      .select(
        "*, members(id, name, phone), staff(id, name, title), services(id, name, duration, price)"
      )
      .gte("start_time", dayStart)
      .lt("start_time", dayEnd)
      .order("start_time"),
    check.supabase
      .from("appointments")
      .select(
        "*, members(id, name, phone), staff(id, name, title), services(id, name, duration, price)"
      )
      .eq("status", "pending")
      .order("start_time"),
    check.supabase
      .from("appointments")
      .select("services(price, member_price), price_snapshot, member_price_snapshot", {
        count: "exact",
      })
      .eq("status", "done")
      .gte("start_time", monthStart),
    check.supabase.from("members").select("id, balance", { count: "exact" }),
  ]);

  const failed = [todayRes, pendingRes, doneRes, membersRes].find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({
    today: todayRes.data ?? [],
    pending: pendingRes.data ?? [],
    done: doneRes.data ?? [],
    doneCount: doneRes.count ?? 0,
    members: membersRes.data ?? [],
    memberCount: membersRes.count ?? 0,
  });
}

// 注意：不要给这里加 export const dynamic / revalidate 等 route segment config。
// 项目开启了 nextConfig.cacheComponents，这类配置会直接让构建失败；而身份核验
// 会读 cookie，本身就保证按请求执行，管理端数据不会被预渲染进构建产物。
