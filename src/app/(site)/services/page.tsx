"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
import { OrnamentDivider, SealMark } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";
import { q } from "@/lib/supabase/query";
import { formatCNY, formatDuration } from "@/lib/format";
import { sceneTagFor } from "@/lib/design";
import type { Services } from "@/lib/types";

export default function ServicesPage() {
  const [services, setServices] = useState<Services[] | null>(null);
  const [category, setCategory] = useState("全部");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    q(() =>
      createClient()
        .from("services")
        .select("*")
        .eq("is_active", true)
        .order("sort_order")
    ).then(({ data }) => setServices((data as Services[]) ?? []));
  }, []);

  const categories = useMemo(() => {
    if (!services) return [];
    const set: string[] = [];
    for (const s of services) {
      if (s.category && !set.includes(s.category)) set.push(s.category);
    }
    return set;
  }, [services]);

  // 搜索与分类是「与」的关系：先按分类收窄，再按关键词筛。
  // 关键词覆盖项目名、描述与场景标签 —— 顾客记得住的往往是症状
  // （「失眠」「肩颈」），而不是项目全名。
  const filtered = useMemo(() => {
    if (!services) return [];
    const byCategory =
      category === "全部"
        ? services
        : services.filter((s) => s.category === category);
    const kw = keyword.trim().toLowerCase();
    if (!kw) return byCategory;
    return byCategory.filter((s) =>
      [s.name, s.description ?? "", s.category ?? "", sceneTagFor(s.category) ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(kw)
    );
  }, [services, category, keyword]);

  const searching = keyword.trim().length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
      {/* 仪式感雅致题头 */}
      <div className="text-center">
        <span className="inline-block border border-bronze-500/60 bg-bronze-50/50 px-3 py-1 font-serif text-xs tracking-widest text-bronze-800">
          静心品鉴 · 调理目录
        </span>
        <h1 className="mt-5 font-serif text-4xl text-bark-800 md:text-5xl">
          服务项目 · 价目手卷
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-sm leading-loose text-bark-500">
          每一段时长，皆是一场留给自己的归心仪式。
          <br className="hidden md:block" />
          全品项目明码标价，会员享专享礼遇，新客首次体验同享会员价。
        </p>
      </div>

      {/* 搜索：项目会长到几十个，逐个扫太慢；顾客记得住的通常也是症状而非项目名 */}
      <div className="mx-auto mt-10 max-w-md">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-bark-400" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜症状或项目名，如「失眠」「肩颈」「头疗」"
            aria-label="搜索服务项目"
            className="h-11 rounded-full border-border/80 bg-card pl-10 pr-10 text-sm"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setKeyword("")}
              aria-label="清空搜索"
              className="absolute right-3 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-bark-400 transition-colors hover:bg-secondary hover:text-bark-600"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 分类切换：文人印章雅致胶囊 */}
      {services !== null && categories.length > 0 && (
        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          {["全部", ...categories].map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`group relative rounded-full border px-5 py-2 text-xs tracking-wider transition-all duration-300 ${
                  active
                    ? "border-bronze-600 bg-bronze-600 font-serif text-ivory shadow-sm shadow-bronze-900/10"
                    : "border-border/80 bg-card text-bark-600 hover:border-bronze-400 hover:text-bronze-800"
                }`}
              >
                <span>{c}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 结果计数：让「有没有搜到」有明确回执，而不是靠数卡片 */}
      {services !== null && (
        <p className="mt-6 text-center text-xs text-bark-400">
          {searching
            ? `「${keyword.trim()}」共 ${filtered.length} 个项目`
            : `${category === "全部" ? "全部" : category} · 共 ${filtered.length} 个项目`}
        </p>
      )}

      {/* 服务项目网格 */}
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {services === null ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))
        ) : filtered.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-border bg-card/50 px-6 py-20 text-center text-sm text-bark-400">
            {services.length === 0 ? (
              "服务项目准备中，敬请期待"
            ) : searching ? (
              <span>
                未找到与「{keyword.trim()}」相关的项目。
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  className="ml-1 text-bronze-700 underline underline-offset-4"
                >
                  清空搜索
                </button>
                {category !== "全部" && "，或换一个分类看看"}
              </span>
            ) : (
              "该分类暂无项目，看看其他分类吧"
            )}
          </div>
        ) : (
          filtered.map((service, i) => (
            <Reveal key={service.id} delay={i * 50} className="h-full">
              <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-bronze-300 hover:shadow-lg hover:shadow-bark-900/5">
                {/* 顶栏：分类印章 + 时长 */}
                <div className="flex items-center justify-between border-b border-border/60 pb-4">
                  {service.category ? (
                    <span className="font-serif text-xs tracking-widest text-bronze-700">
                      {service.category}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="flex items-center gap-1.5 text-xs text-bark-400">
                    <Clock className="size-3.5 text-bronze-600" />
                    {formatDuration(service.duration)}
                  </span>
                </div>

                {/* 标题 */}
                <h2 className="mt-4 font-serif text-xl text-bark-800 transition-colors group-hover:text-bronze-800">
                  {service.name}
                </h2>

                {/* 详情描述 */}
                <p className="mt-3 flex-1 text-sm leading-relaxed text-bark-500">
                  {service.description ?? "详情请到店咨询。"}
                </p>

                {/* 适宜场景 */}
                {sceneTagFor(service.category) && (
                  <p className="mt-4 flex items-center gap-2 text-xs text-bronze-700">
                    <span className="size-1 rotate-45 bg-bronze-500" />
                    适合 {sceneTagFor(service.category)}
                  </p>
                )}

                {/* 底部价格与按钮 */}
                <div className="mt-6 border-t border-border/70 pt-5">
                  <div className="flex items-end justify-between">
                    <div>
                      {service.member_price != null ? (
                        <>
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-serif text-2xl text-bronze-700">
                              {formatCNY(service.member_price)}
                            </span>
                            <span className="text-[11px] font-serif text-bronze-600/80">
                              会员价
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-bark-400">
                            门市 {formatCNY(service.price)}
                          </p>
                        </>
                      ) : (
                        <span className="font-serif text-2xl text-bronze-700">
                          {formatCNY(service.price)}
                        </span>
                      )}
                    </div>

                    <Button
                      asChild
                      size="sm"
                      className="bg-bronze-500 text-white hover:bg-bronze-600"
                    >
                      <Link href={`/book?service=${service.id}`}>
                        预约此项目 <ArrowRight className="size-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            </Reveal>
          ))
        )}
      </div>

      <Reveal>
        <OrnamentDivider className="my-16" />
      </Reveal>

      {/* 价格与权益手卷说明 */}
      <Reveal>
        <div className="overflow-hidden rounded-2xl border border-bronze-200/80 bg-gradient-to-br from-paper via-card to-bronze-50/50 p-8 shadow-sm md:p-12">
          <div className="flex items-center gap-3 border-b border-bronze-200/70 pb-5">
            <SealMark text="权益" />
            <div>
              <p className="font-serif text-lg text-bark-800">
                林梓会员 · 权益与充赠须知
              </p>
              <p className="text-xs text-bark-400">
                收付款走微信线下，充值后由老板手动登记入账，全程审计留痕
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-border/70 bg-background/80 p-5">
              <span className="font-serif text-xs text-bronze-700">礼遇 · 壹</span>
              <h4 className="mt-2 font-serif text-base text-bark-800">
                新客首次体验
              </h4>
              <p className="mt-2 text-xs leading-relaxed text-bark-500">
                初次到店的新朋友，首个理疗项目直接享受会员价，无需预先充值，体验后再作决定。
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-background/80 p-5">
              <span className="font-serif text-xs text-bronze-700">礼遇 · 贰</span>
              <h4 className="mt-2 font-serif text-base text-bark-800">
                充值增送项目
              </h4>
              <p className="mt-2 text-xs leading-relaxed text-bark-500">
                充值 500 / 1000 / 2000 元，全单享永久会员价，并分别赠送 1 / 3 / 6 个特色项目（有效期 1 年）。
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-background/80 p-5">
              <span className="font-serif text-xs text-bronze-700">礼遇 · 叁</span>
              <h4 className="mt-2 font-serif text-base text-bark-800">
                次卡优惠专享
              </h4>
              <p className="mt-2 text-xs leading-relaxed text-bark-500">
                草本泡浴 10 次卡 ¥1680（送 3 次）、全身舒缓 10 次卡 ¥1980，请到店咨询老板办理登记。
              </p>
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-bark-400">
            * 本店提供养生舒缓与经络调理服务，无医疗诊疗属性。健康一个人，幸福一个家。
          </p>
        </div>
      </Reveal>
    </div>
  );
}
