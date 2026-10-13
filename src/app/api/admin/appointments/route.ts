import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/dal";


/**
 * GET /api/admin/appointments?from=<iso>&to=<iso>
 *
 * 返回管理端预约列表（含 members / staff / services 关联）。
 *
 * 为什么必须走服务端：客户端直连时，若当前浏览器会话不是 admin，
 * `members` 的内嵌关联会被 RLS 静默过滤成 null，页面随即显示「匿名客户」。
 * 这里先在服务端核验 admin 身份，再以该身份查询，关联不再被置空；
 * 身份不符则明文 403，绝不静默返回缺字段的数据。
 */
export async function GET(request: Request) {
  const check = await requireAdmin();
  if (!check.ok) {
    return NextResponse.json(
      { error: check.error },
      { status: check.status }
    );
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = check.supabase
    .from("appointments")
    .select(
      "*, members(id, name, phone), staff(id, name, title), services(id, name, duration, price)"
    )
    .order("start_time");

  if (from) query = query.gte("start_time", from);
  if (to) query = query.lt("start_time", to);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ appointments: data ?? [] });
}

// 注意：不要给这里加 export const dynamic / revalidate 等 route segment config。
// 项目开启了 nextConfig.cacheComponents，这类配置会直接让构建失败；而身份核验
// 会读 cookie，本身就保证按请求执行，管理端数据不会被预渲染进构建产物。
