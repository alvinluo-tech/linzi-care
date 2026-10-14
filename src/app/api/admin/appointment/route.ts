import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/dal";


/**
 * GET /api/admin/appointment?id=<uuid>
 * 单条预约详情，字段与 /appointments 列表一致（AppointmentWithRefs）。
 *
 * 两个消费者：
 * 1. RealtimeNotifier 收到新预约推送后组装提示文案；
 * 2. 通知中心「点开直接办」—— 据此打开 AppointmentDialog 处理该单。
 *
 * 都必须走服务端：客户端若持非 admin 会话，members 的内嵌关联会被 RLS
 * 静默置空，提示与弹窗就变成「匿名客户」。
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
    .select(
      "*, members(id, name, phone), staff(id, name, title), services(id, name, duration, price, member_price)"
    )
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
