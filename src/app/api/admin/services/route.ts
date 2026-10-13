import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/dal";


/** GET /api/admin/services —— 服务项目 + 技师指派关系 + 技师列表 */
export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const [servicesRes, staffRes, linksRes] = await Promise.all([
    check.supabase.from("services").select("*").order("sort_order"),
    check.supabase.from("staff").select("*").order("sort_order"),
    check.supabase.from("staff_services").select("*"),
  ]);

  const failed = [servicesRes, staffRes, linksRes].find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({
    services: servicesRes.data ?? [],
    staff: staffRes.data ?? [],
    staff_services: linksRes.data ?? [],
  });
}

// 注意：不要给这里加 export const dynamic / revalidate 等 route segment config。
// 项目开启了 nextConfig.cacheComponents，这类配置会直接让构建失败；而身份核验
// 会读 cookie，本身就保证按请求执行，管理端数据不会被预渲染进构建产物。
