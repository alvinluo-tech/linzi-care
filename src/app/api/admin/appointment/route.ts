import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/dal";


/**
 * GET /api/admin/appointment?id=<uuid>
 * 单条预约详情（含 members / staff / services 名称）。
 * RealtimeNotifier 收到新预约推送后据此组装提示文案 —— 走服务端可确保
 * 客户名不因客户端非 admin 会话被 RLS 静默置空（那样会提示「会员」）。
 */
export async function GET(request: Request) {
  const check = await requireAdmin();
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少 id 参数" }, { status: 400 });
  }

  const { data, error } = await check.supabase
    .from("appointments")
    .select("start_time, members(name), staff(name), services(name)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ appointment: data ?? null });
}

// 注意：不要给这里加 export const dynamic / revalidate 等 route segment config。
// 项目开启了 nextConfig.cacheComponents，这类配置会直接让构建失败；而身份核验
// 会读 cookie，本身就保证按请求执行，管理端数据不会被预渲染进构建产物。
