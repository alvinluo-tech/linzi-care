import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/dal";


/**
 * GET /api/admin/inbox?day_start=<iso>&day_end=<iso>
 * 通知中心聚合数据：待确认预约、投递失败通知、今日待打点预约。
 *
 * 同样走服务端 admin 身份：待确认/今日客单都内嵌 members(name)，
 * 客户端非 admin 会话下该关联会被 RLS 静默置空（显示成「会员」）。
 */
export async function GET(request: Request) {
  const check = await requireAdmin();
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { searchParams } = new URL(request.url);
  const dayStart = searchParams.get("day_start");
  const dayEnd = searchParams.get("day_end");
  if (!dayStart || !dayEnd) {
    return NextResponse.json(
      { error: "缺少 day_start / day_end 参数" },
      { status: 400 }
    );
  }

  const [pendingRes, failedRes, todayRes] = await Promise.all([
    check.supabase
      .from("appointments")
      .select("id, created_at, start_time, members(name), services(name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20),
    check.supabase
      .from("notifications")
      .select("id, created_at, type, channel, appointment_id")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(20),
    check.supabase
      .from("appointments")
      .select("id, start_time, status, members(name), services(name)")
      .in("status", ["confirmed", "arrived"])
      .gte("start_time", dayStart)
      .lt("start_time", dayEnd)
      .order("start_time")
      .limit(20),
  ]);

  const failed = [pendingRes, failedRes, todayRes].find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({
    pending: pendingRes.data ?? [],
    failedNotifications: failedRes.data ?? [],
    todayArrive: todayRes.data ?? [],
  });
}

// 注意：不要给这里加 export const dynamic / revalidate 等 route segment config。
// 项目开启了 nextConfig.cacheComponents，这类配置会直接让构建失败；而身份核验
// 会读 cookie，本身就保证按请求执行，管理端数据不会被预渲染进构建产物。
