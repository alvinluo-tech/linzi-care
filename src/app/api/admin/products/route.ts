import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/dal";


/** GET /api/admin/products —— 商品橱窗 + 品类 */
export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const [productsRes, categoriesRes] = await Promise.all([
    check.supabase
      .from("products")
      .select("*, product_categories(id, name)")
      .order("sort_order"),
    check.supabase.from("product_categories").select("*").order("sort_order"),
  ]);

  const failed = productsRes.error ?? categoriesRes.error;
  if (failed) {
    return NextResponse.json({ error: failed.message }, { status: 500 });
  }

  return NextResponse.json({
    products: productsRes.data ?? [],
    categories: categoriesRes.data ?? [],
  });
}

// 注意：不要给这里加 export const dynamic / revalidate 等 route segment config。
// 项目开启了 nextConfig.cacheComponents，这类配置会直接让构建失败；而身份核验
// 会读 cookie，本身就保证按请求执行，管理端数据不会被预渲染进构建产物。
