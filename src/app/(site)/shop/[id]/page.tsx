"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, CalendarPlus, Phone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageLoader, SealMark } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";
import { formatCNY, STOCK_STATUS_META } from "@/lib/format";
import type { ProductWithCategory, Stores } from "@/lib/types";

export default function ProductDetailPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ProductDetail />
    </Suspense>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-16 md:grid-cols-2 md:px-6 md:py-24">
      <Skeleton className="aspect-square rounded-2xl" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<ProductWithCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<Stores | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("products")
      .select("*, product_categories(id, name)")
      .eq("id", id as string)
      .maybeSingle()
      .then(({ data }) => {
        setProduct((data as ProductWithCategory) ?? null);
        setLoading(false);
      });
    supabase
      .from("stores")
      .select("*")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setStore((data as Stores) ?? null));
  }, [id]);

  if (loading) {
    return <DetailSkeleton />;
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-28 text-center md:px-6">
        <PageLoader label="好物不存在或已撤柜" />
        <Button asChild variant="outline" className="mt-8">
          <Link href="/shop">
            <ArrowLeft className="size-4" /> 返回物舍橱窗
          </Link>
        </Button>
      </div>
    );
  }

  const stock = STOCK_STATUS_META[product.stock_status];

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-20">
      <Link
        href="/shop"
        className="inline-flex items-center gap-1.5 text-xs tracking-wider text-bark-500 transition-colors hover:text-bronze-700"
      >
        <ArrowLeft className="size-3.5" /> 返回物舍橱窗
      </Link>

      <div className="mt-8 grid gap-12 md:grid-cols-2">
        {/* 展品巨幅画框 */}
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-bark-100/70 via-paper to-bronze-100/60 p-2 shadow-sm">
          <div className="relative size-full overflow-hidden rounded-xl bg-card">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image_url}
                alt={product.name}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <span className="font-serif text-8xl text-bark-300">
                  {product.name.slice(0, 1)}
                </span>
              </div>
            )}
            <span className="absolute left-3.5 top-3.5 rounded-full border border-bark-700/40 bg-bark-800/85 px-3 py-1 text-[11px] tracking-widest text-ivory">
              到店体验品鉴
            </span>
          </div>
        </div>

        {/* 详尽手卷文案 */}
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <SealMark text="好物" />
            {product.product_categories && (
              <span className="font-serif text-xs tracking-widest text-bronze-700">
                {product.product_categories.name}
              </span>
            )}
          </div>

          <h1 className="mt-4 font-serif text-3xl text-bark-800 md:text-4xl">
            {product.name}
          </h1>

          <div className="mt-5 flex items-baseline gap-3">
            <span className="font-serif text-3xl font-medium text-bronze-700">
              {formatCNY(product.price)}
            </span>
            <span className={`rounded-sm border px-2 py-0.5 text-xs ${stock?.badge ?? ""}`}>
              {stock?.label ?? "在售"}
            </span>
            <span className="text-xs text-bark-400">· 线下到店专享</span>
          </div>

          <div className="my-6 h-px bg-border/80" />

          <div>
            <h2 className="font-serif text-sm tracking-wider text-bark-800">
              物之原委 · 详述
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-loose text-bark-600">
              {product.description ?? "暂无详述，欢迎到店品尝或试用。"}
            </p>
          </div>

          <div className="mt-8 rounded-xl border border-bronze-200/80 bg-bronze-50/50 p-4.5">
            <div className="flex items-start gap-2.5">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-bronze-600" />
              <p className="text-xs leading-relaxed text-bark-600">
                本品为店内纯实物陈列。理疗调理前后，专属技师可结合您的当下体质，为您推荐适宜的草本冲饮或伴手香氛。
              </p>
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-3 pt-10 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="flex-1 bg-bronze-500 text-white hover:bg-bronze-600"
            >
              <Link href="/book">
                <CalendarPlus className="size-4" /> 预约到店体验
              </Link>
            </Button>
            {store?.phone && (
              <Button asChild size="lg" variant="outline" className="flex-1">
                <a href={`tel:${store.phone}`}>
                  <Phone className="size-4" /> 拨号垂询
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
