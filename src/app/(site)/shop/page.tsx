"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageLoader, SealMark } from "@/components/brand";
import { Reveal } from "@/components/ui/reveal";
import { createClient } from "@/lib/supabase/client";
import { formatCNY, STOCK_STATUS_META } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProductWithCategory } from "@/lib/types";

export default function ShopPage() {
  const [products, setProducts] = useState<ProductWithCategory[] | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    []
  );
  const [categoryId, setCategoryId] = useState("全部");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("products")
      .select("*, product_categories(id, name)")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setProducts((data as ProductWithCategory[]) ?? []));
    supabase
      .from("product_categories")
      .select("id, name")
      .order("sort_order")
      .then(({ data }) => setCategories((data as { id: string; name: string }[]) ?? []));
  }, []);

  const filtered = useMemo(() => {
    if (!products) return [];
    return categoryId === "全部"
      ? products
      : products.filter((p) => p.product_categories?.id === categoryId);
  }, [products, categoryId]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
      {/* 仪式感展厅题头 */}
      <div className="text-center">
        <span className="inline-block border border-bronze-500/60 bg-bronze-50/50 px-3 py-1 font-serif text-xs tracking-widest text-bronze-800">
          物尽其用 · 颐养物舍
        </span>
        <h1 className="mt-5 font-serif text-4xl text-bark-800 md:text-5xl">
          颐养好物 · 选品橱窗
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-sm leading-loose text-bark-500">
          本舍精选日常草本茶饮、艾香精油与温养器具。
          <br className="hidden md:block" />
          纯为店内实物展示与线下咨询体验，不设在线支付，静候亲临品鉴。
        </p>
      </div>

      {/* 分类标签切换 */}
      {categories.length > 0 && (
        <div className="mt-12 flex flex-wrap justify-center gap-2.5">
          {["全部", ...categories.map((c) => c.id)].map((id) => {
            const label =
              id === "全部" ? "全部" : categories.find((c) => c.id === id)!.name;
            const active = categoryId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setCategoryId(id)}
                className={cn(
                  "rounded-full border px-5 py-2 text-xs tracking-wider transition-all duration-300",
                  active
                    ? "border-bronze-600 bg-bronze-600 font-serif text-ivory shadow-sm shadow-bronze-900/10"
                    : "border-border/80 bg-card text-bark-600 hover:border-bronze-400 hover:text-bronze-800"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* 商品网格展台 */}
      <div className="mt-12 grid grid-cols-2 gap-6 lg:grid-cols-4">
        {products === null ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5] rounded-2xl" />
          ))
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-16">
            <PageLoader label="展柜整备中，敬请期待" />
          </div>
        ) : (
          filtered.map((product, idx) => {
            const stock = STOCK_STATUS_META[product.stock_status];
            return (
              <Reveal key={product.id} delay={idx * 50}>
                <Link
                  href={`/shop/${product.id}`}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card p-4 transition-all duration-500 hover:-translate-y-1.5 hover:border-bronze-400 hover:shadow-xl hover:shadow-bark-900/5"
                >
                  {/* 展品大图视窗 */}
                  <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-gradient-to-br from-bark-100/60 via-paper to-bronze-100/50">
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <span className="font-serif text-6xl text-bark-300/80 transition-colors group-hover:text-bronze-600/50">
                          {product.name.slice(0, 1)}
                        </span>
                      </div>
                    )}

                    {/* 到店体验角标 */}
                    <span className="absolute left-3 top-3 rounded-full border border-bark-700/40 bg-bark-800/85 px-2.5 py-0.5 text-[10px] tracking-widest text-ivory backdrop-blur-xs">
                      到店体验
                    </span>

                    {/* 库存状态角标 */}
                    {product.stock_status !== "in_stock" && (
                      <span className="absolute right-3 top-3 rounded-md bg-bark-900/80 px-2 py-0.5 text-[10px] text-ivory">
                        {stock?.label}
                      </span>
                    )}
                  </div>

                  {/* 铭牌信息 */}
                  <div className="mt-4 flex flex-1 flex-col">
                    {product.product_categories && (
                      <p className="font-serif text-[11px] text-bronze-700">
                        {product.product_categories.name}
                      </p>
                    )}
                    <h3 className="mt-1 font-serif text-base text-bark-800 transition-colors group-hover:text-bronze-800">
                      {product.name}
                    </h3>
                    <p className="mt-1 line-clamp-1 text-xs text-bark-400">
                      {product.description ?? "到店品鉴体验"}
                    </p>

                    <div className="mt-auto flex items-baseline justify-between border-t border-border/60 pt-3">
                      <span className="font-serif text-lg font-medium text-bronze-700">
                        {formatCNY(product.price)}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-bark-400 transition-colors group-hover:text-bronze-700">
                        品鉴细览 <ArrowRight className="size-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              </Reveal>
            );
          })
        )}
      </div>

      {/* 底部养生物舍说明卡 */}
      <div className="mt-20 rounded-2xl border border-bronze-200/80 bg-gradient-to-br from-paper via-card to-bronze-50/40 p-8 text-center md:p-12">
        <SealMark text="物道" className="mx-auto" />
        <h4 className="mt-4 font-serif text-xl text-bark-800">
          物润其身 · 草木有灵
        </h4>
        <p className="mx-auto mt-3 max-w-lg text-xs leading-loose text-bark-500">
          馆内所售之茶饮与精油，均随四时节令精选。体验项目之余，不妨在茶榻前细嗅细尝，带一份轻安归家。
        </p>
      </div>
    </div>
  );
}
