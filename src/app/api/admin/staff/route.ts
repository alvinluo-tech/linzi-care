import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/dal";


/**
 * GET /api/admin/staff —— 员工档案 + profiles（手机/邮箱）
 * 员工管理页需要把 profiles 里的联系方式拼到 staff 上。
 */
export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const [staffRes, profilesRes] = await Promise.all([
    check.supabase.from("staff").select("*").order("sort_order"),
    check.supabase.from("profiles").select("id, phone, email"),
  ]);

  const failed = staffRes.error ?? profilesRes.error;
  if (failed) {
    return NextResponse.json({ error: failed.message }, { status: 500 });
  }

  return NextResponse.json({
    staff: staffRes.data ?? [],
    profiles: profilesRes.data ?? [],
  });
}

// 注意：不要给这里加 export const dynamic / revalidate 等 route segment config。
// 项目开启了 nextConfig.cacheComponents，这类配置会直接让构建失败；而身份核验
// 会读 cookie，本身就保证按请求执行，管理端数据不会被预渲染进构建产物。
