"use client";

import Image from "next/image";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BeautyArt,
  BrandMark,
  HeadSpaArt,
  OrnamentDivider,
  SealMark,
  WellnessArt,
} from "@/components/brand";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/section-heading";
import { createClient } from "@/lib/supabase/client";
import { q } from "@/lib/supabase/query";
import { formatCNY, formatDuration } from "@/lib/format";
import { sceneTagFor } from "@/lib/design";
import { STORE_POSITIONING, STORE_VISION } from "@/lib/constants";
import type { Products, Services } from "@/lib/types";

export default function HomePage() {
  const [services, setServices] = useState<Services[] | null>(null);
  const [products, setProducts] = useState<Products[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    q(() =>
      supabase
        .from("services")
        .select("*")
        .eq("is_active", true)
        .order("sort_order")
        .limit(6)
    ).then(({ data }) => setServices((data as Services[]) ?? []));
    q(() =>
      supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("sort_order")
        .limit(4)
    ).then(({ data }) => setProducts((data as Products[]) ?? []));
  }, []);

  return (
    <div>
      {/* 品牌首屏：一段留给自己的时间 */}
      <section className="relative flex min-h-[86svh] items-center overflow-hidden">
        <div className="pointer-events-none absolute -right-40 -top-40 size-[480px] rounded-full bg-bronze-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 -left-32 size-[420px] rounded-full bg-bark-300/15 blur-3xl" />

        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-4 py-20 md:grid-cols-[1.08fr_0.92fr] md:px-6">
          <div className="animate-fade-up">
            <div className="flex items-center gap-3">
              <span className="h-px w-10 bg-bronze-500/70" />
              <p className="text-xs tracking-[0.4em] text-bronze-700">
                {STORE_POSITIONING}
              </p>
            </div>
            <h1 className="mt-7 font-serif text-5xl leading-[1.15] text-bark-800 md:text-7xl">
              身心归处，
              <br />
              <span className="text-bronze-700">静养有方。</span>
            </h1>
            <p className="mt-8 max-w-md text-base leading-loose text-bark-500">
              以千年古方瑶浴头疗为引，融古法按摩、美容抗衰与内调外养——把一段完整的时间，留给自己。
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Button
                asChild
                size="lg"
                className="h-12 bg-bronze-500 px-8 text-white hover:bg-bronze-600"
              >
                <Link href="/book">
                  立即预约 <ArrowRight />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 border-bark-300 px-8 text-bark-700 hover:bg-accent"
              >
                <Link href="/services">了解服务项目</Link>
              </Button>
            </div>
            <p className="mt-10 flex items-center gap-2 text-xs text-bark-400">
              <MapPin className="size-3.5 shrink-0 text-bronze-600" />
              广州市增城区新塘镇 · 国贸汇 — 敬请预约到店
            </p>
          </div>

          <div className="relative animate-fade-up-late">
            <div className="relative rounded-xl border border-border bg-card/90 p-8 shadow-xl shadow-bark-900/5 md:p-12">
              <div className="flex items-start justify-between">
                <span className="text-vertical font-serif text-6xl tracking-[0.35em] text-bark-700 md:text-7xl">
                  静养
                </span>
                <BrandMark className="size-12 text-bronze-600/70" />
              </div>
              <MountainArt className="mt-10 w-full max-w-[220px] text-bronze-500/50" />
              <OrnamentDivider className="my-8" />
              <div className="flex items-center justify-between text-sm text-bark-500">
                <span>古法 · 瑶浴 · 温养</span>
                <span className="text-bark-400">LINZI SINCE 增城新塘</span>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-5 hidden rounded-lg border border-bronze-200 bg-bronze-50 px-5 py-3 shadow-sm md:block">
              <p className="font-serif text-base text-bronze-800">
                以手传心 · 以术养身
              </p>
            </div>
          </div>
        </div>

        {/* 向下探索的呼吸引导 */}
        <div className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2.5 md:flex">
          <span className="text-[10px] tracking-[0.4em] text-bark-400">
            向下探索
          </span>
          <span className="h-10 w-px animate-pulse bg-gradient-to-b from-bronze-500/70 to-transparent" />
        </div>
      </section>

      {/* 服务项目：把时间还给自己 */}
      <section className="mx-auto max-w-6xl px-4 py-24 md:px-6 md:py-32">
        <Reveal>
          <SectionHeading
            eyebrow="SERVICES"
            title="把时间还给自己"
            sub="每一项调理都由专属技师一对一完成。先看适合的场景，再选心仪的项目——新客首次体验按会员价。"
            moreHref="/services"
            moreLabel="查看全部价目"
          />
        </Reveal>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services === null
            ? Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-56 rounded-xl" />
              ))
            : services.map((service, i) => (
                <Reveal key={service.id} delay={i * 70} className="h-full">
                  <Link
                    href={`/book?service=${service.id}`}
                    className="group flex h-full flex-col rounded-xl border border-border bg-card p-7 transition-all duration-300 hover:-translate-y-1 hover:border-bronze-300 hover:shadow-lg hover:shadow-bark-900/5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {service.category && (
                        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] tracking-wide text-bark-500">
                          {service.category}
                        </span>
                      )}
                      <span className="text-xs text-bark-400">
                        {formatDuration(service.duration)}
                      </span>
                    </div>
                    <h3 className="mt-4 font-serif text-xl text-bark-800">
                      {service.name}
                    </h3>
                    <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-bark-400">
                      {service.description ?? "详情请咨询门店。"}
                    </p>
                    {sceneTagFor(service.category) && (
                      <p className="mt-3.5 flex items-center gap-2 text-xs text-bronze-700">
                        <span className="size-1 shrink-0 rotate-45 bg-bronze-500" />
                        适合 {sceneTagFor(service.category)}
                      </p>
                    )}
                    <div className="mt-auto pt-6">
                      <div className="flex items-center justify-between border-t border-border/70 pt-4">
                        <PricePair
                          price={service.price}
                          memberPrice={service.member_price}
                        />
                      </div>
                      <p className="mt-3.5 flex items-center gap-1.5 text-sm text-bark-500 transition-colors group-hover:text-bronze-700">
                        预约此项目
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </p>
                    </div>
                  </Link>
                </Reveal>
              ))}
        </div>
      </section>

      {/* 招牌 · 瑶浴头疗文化 */}
      <section className="relative overflow-hidden bg-bark-800 text-ivory">
        <div className="pointer-events-none absolute left-1/2 top-0 size-[560px] -translate-x-1/2 rounded-full bg-bronze-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-24 md:px-6 md:py-32">
          <Reveal>
            <SectionHeading
              align="center"
              tone="dark"
              eyebrow="HERITAGE RITUAL"
              title="千年古方 · 瑶浴头疗"
              sub="瑶族养生文化传承千年，「瑶药浴」是广西瑶族人民世代相传、备受推崇的独特洗浴方式，讲究天然、无副作用。头疗「三泡三出」层层深入，是您养生的理想选择。"
            />
          </Reveal>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                step: "壹",
                title: "排毒 · 头部熏蒸",
                text: "瑶医认为「百病由毒发」。瑶药熏蒸打开头皮毛孔、软化角质，排出头皮毒素与各种生活环境下的外源毒素。",
              },
              {
                step: "贰",
                title: "通络 · 经络疏通",
                text: "以经络梳头法梳理百会穴，打通头部气血通道，改善头晕头疼、失眠、记忆力下降等亚健康困扰。",
              },
              {
                step: "叁",
                title: "激活 · 巩固再生",
                text: "瑶药水循环促进吸收，强健发根、赋活毛囊，防脱固发；安神助眠，提高睡眠质量与身体状态。",
              },
            ].map((item, i) => (
              <Reveal key={item.step} delay={i * 100} className="h-full">
                <div className="group h-full rounded-xl border border-bark-600 bg-bark-900/70 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-bronze-500/40">
                  <span className="flex size-11 items-center justify-center rounded-full border border-bronze-400/60 font-serif text-base text-bronze-300 transition-colors group-hover:bg-bronze-500/10">
                    {item.step}
                  </span>
                  <h3 className="mt-5 font-serif text-lg text-ivory">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-loose text-bark-200">
                    {item.text}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={200}>
            <p className="mt-14 text-center font-serif text-sm tracking-[0.5em] text-bronze-300">
              三 / 泡 / 三 / 出 · 排 / 毒 / 通 / 络 / 激 / 活
            </p>
          </Reveal>
        </div>
      </section>

      {/* 三大主业 + 健康四大基石（新中式文人画册形态） */}
      <section className="relative overflow-hidden bg-gradient-to-b from-background via-paper/60 to-background py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <Reveal>
            <SectionHeading
              eyebrow="PILLARS OF WELLNESS"
              title="三大主业 · 调养体系"
              sub="以千年瑶方为源，取草木温煦之气，在经络吐纳之间，由外而内重构身心的自然秩序。"
            />
          </Reveal>

          {/* 三大主业：手卷式画卷卡片 */}
          <div className="mt-14 grid gap-8 lg:grid-cols-3">
            {[
              {
                seal: "首道",
                title: "头疗",
                titleSub: "古法按摩 · 养发固元",
                verse: "「头为诸阳之会，百脉所通。」",
                text: "姜汤温煦头皮，配以经络梳百会穴深层疏导。融合瑶浴熏蒸与中药水循环，打开毛囊微循环，驱散风寒滞气，安神助眠、生发固根。",
                points: ["姜汤温养头皮", "百会经络疏通", "瑶药熏蒸排污"],
                Art: HeadSpaArt,
              },
              {
                seal: "润颜",
                title: "美容",
                titleSub: "肌理修护 · 凝时抗衰",
                verse: "「外显于面，内源于气血之丰。」",
                text: "摒弃化学刺激，循肌理走向施以提拉紧致手法。草本菁萃层层渗透，滋养真皮屏障，抚平疲态倦容，唤醒肌肤原生的水润弹韧与清雅透亮。",
                points: ["深层排污净化", "轮廓提拉紧致", "屏障赋活水润"],
                Art: BeautyArt,
              },
              {
                seal: "固本",
                title: "养生",
                titleSub: "扶阳升温 · 内调外养",
                verse: "「阳气若足，千年松柏常青。」",
                text: "以南岭草本瑶浴为引，辅以古法督脉开背、温灸腹部与经络刮痧。温热之力深入经络骨髓，温煦脾胃脏腑，由里及表重铸抵御外邪的内在元气。",
                points: ["草本瑶浴温通", "督脉温阳开背", "艾灸扶阳固本"],
                Art: WellnessArt,
              },
            ].map((pillar, i) => (
              <Reveal key={pillar.title} delay={i * 90} className="h-full">
                <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card p-8 shadow-sm transition-all duration-500 hover:-translate-y-1 hover:border-bronze-400/80 hover:shadow-xl hover:shadow-bark-900/5">
                  {/* 顶栏：朱文印章 + 雅号 */}
                  <div className="flex items-center justify-between border-b border-border/60 pb-5">
                    <SealMark text={pillar.seal} />
                    <span className="text-[11px] tracking-[0.25em] text-bark-400">
                      LINZI WELLNESS
                    </span>
                  </div>

                  {/* 意境白描插图 */}
                  <div className="my-6 flex items-center justify-center rounded-lg bg-paper/60 py-4 transition-transform duration-500 group-hover:scale-[1.03]">
                    <pillar.Art className="h-20 w-auto text-bronze-600/70 transition-colors duration-500 group-hover:text-bronze-700" />
                  </div>

                  {/* 标题与副题 */}
                  <div>
                    <h3 className="font-serif text-2xl text-bark-800">
                      {pillar.title}
                    </h3>
                    <p className="mt-1 font-serif text-sm text-bronze-700">
                      {pillar.titleSub}
                    </p>
                  </div>

                  {/* 医理引言 */}
                  <p className="mt-4 font-serif text-xs italic tracking-wider text-bark-500">
                    {pillar.verse}
                  </p>

                  {/* 详述正文 */}
                  <p className="mt-3.5 flex-1 text-sm leading-relaxed text-bark-600">
                    {pillar.text}
                  </p>

                  {/* 调理要诀清单 */}
                  <div className="mt-6 border-t border-border/60 pt-5">
                    <p className="text-[11px] font-medium tracking-widest text-bark-400">
                      核心调理步骤
                    </p>
                    <ul className="mt-2.5 space-y-1.5">
                      {pillar.points.map((pt) => (
                        <li
                          key={pt}
                          className="flex items-center gap-2 text-xs text-bark-600"
                        >
                          <span className="size-1 rotate-45 bg-bronze-500/70" />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <OrnamentDivider className="my-20" />
          </Reveal>

          {/* 健康四大基石：文人典雅立轴横幅 */}
          <div className="rounded-2xl border border-bronze-200/70 bg-gradient-to-br from-paper via-card to-bronze-50/40 p-8 shadow-sm md:p-14">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <span className="inline-block border border-bronze-500/60 bg-bronze-50/50 px-3 py-1 font-serif text-xs tracking-widest text-bronze-800">
                  日常养生规矩 · 内养法则
                </span>
                <h3 className="mt-5 font-serif text-2xl text-bark-800 md:text-3xl">
                  健康四大基石
                </h3>
                <p className="mt-3 text-sm leading-loose text-bark-500">
                  养生之道，三分在馆内手法调理，七分在平日起居起伏。内外相合，方得恒久轻安。
                </p>
              </div>
            </Reveal>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  order: "壹",
                  label: "食饮有节",
                  title: "均衡营养",
                  desc: "顺四时之序，多食五谷温热之物，少饮冰酪寒凉。温脾健胃，气血乃充。",
                },
                {
                  order: "贰",
                  label: "恬淡虚无",
                  title: "平和心态",
                  desc: "心常泰然，喜怒无过激，肝气自得调达。气血畅达全身，面色自发红润。",
                },
                {
                  order: "叁",
                  label: "起居有常",
                  title: "充足睡眠",
                  desc: "子时入梦，阳气得以潜藏固蓄。深度修养七八时辰，神清目爽，元神得宁。",
                },
                {
                  order: "肆",
                  label: "形劳不倦",
                  title: "适度运动",
                  desc: "八段锦、微步缓行，微汗即止。疏筋通络、宣通毛孔，身轻如燕。",
                },
              ].map((item, idx) => (
                <Reveal key={item.title} delay={idx * 80}>
                  <div className="group relative flex h-full flex-col rounded-xl border border-border/80 bg-background/80 p-6 transition-all duration-300 hover:border-bronze-300 hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <span className="font-serif text-xs text-bronze-700">
                        基石 · {item.order}
                      </span>
                      <span className="rounded-sm bg-secondary px-2 py-0.5 font-serif text-[11px] text-bark-600">
                        {item.label}
                      </span>
                    </div>
                    <h4 className="mt-4 font-serif text-lg text-bark-800">
                      {item.title}
                    </h4>
                    <p className="mt-2.5 text-xs leading-relaxed text-bark-500">
                      {item.desc}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 商城橱窗 */}
      <section className="border-y border-border bg-paper">
        <div className="mx-auto max-w-6xl px-4 py-24 md:px-6 md:py-32">
          <Reveal>
            <SectionHeading
              eyebrow="BOUTIQUE"
              title="颐养商城"
              sub="精选草本茶饮与养生好物，橱窗展示 · 到店体验选购。"
              moreHref="/shop"
              moreLabel="进入商城"
            />
          </Reveal>
          <div className="mt-12 grid grid-cols-2 gap-6 lg:grid-cols-4">
            {products === null
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
                ))
              : products.map((product, i) => (
                  <Reveal key={product.id} delay={i * 70}>
                    <Link href={`/shop/${product.id}`} className="group block">
                      <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-border bg-gradient-to-br from-bark-100 via-card to-bronze-100">
                        {product.image_url ? (
                          <Image
                            src={product.image_url}
                            alt={product.name}
                            fill
                            sizes="(max-width: 640px) 50vw, 25vw"
                            className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center">
                            <span className="font-serif text-6xl text-bark-300">
                              {product.name.slice(0, 1)}
                            </span>
                          </div>
                        )}
                        <span className="absolute left-3 top-3 rounded-full bg-bark-800/85 px-2.5 py-1 text-[10px] tracking-[0.2em] text-ivory">
                          到店体验
                        </span>
                      </div>
                      <div className="mt-3.5 flex items-center justify-between">
                        <p className="text-sm text-bark-700">{product.name}</p>
                        <p className="text-sm font-medium text-bronze-700">
                          {formatCNY(product.price)}
                        </p>
                      </div>
                    </Link>
                  </Reveal>
                ))}
          </div>
        </div>
      </section>

      {/* 预约引导 · 愿景 */}
      <section className="bg-bark-800">
        <div className="mx-auto max-w-6xl px-4 py-24 text-center md:px-6 md:py-28">
          <Reveal>
            <p className="text-[11px] tracking-[0.5em] text-bronze-300">
              RESERVATION
            </p>
            <h2 className="mt-4 font-serif text-3xl text-ivory md:text-4xl">
              今日始，与身心和解
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-loose text-bark-200">
              选择心仪的项目与技师，挑一段合适的时间——四步完成预约，到店凭会员身份轻松核销。
            </p>
            <p className="mx-auto mt-10 max-w-xl border-t border-bark-700 pt-9 font-serif text-sm leading-loose text-bronze-200">
              「{STORE_VISION}」
            </p>
            <Button
              asChild
              size="lg"
              className="mt-9 h-12 bg-bronze-500 px-10 text-white hover:bg-bronze-600"
            >
              <Link href="/book">
                开始预约 <ArrowRight />
              </Link>
            </Button>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

/** 会员价 + 门市价 两档展示 */
function PricePair({
  price,
  memberPrice,
}: {
  price: number;
  memberPrice: number | null;
}) {
  if (memberPrice == null) {
    return (
      <span className="font-medium text-bronze-700">{formatCNY(price)}</span>
    );
  }
  return (
    <span className="flex items-baseline gap-2">
      <span className="font-serif text-lg text-bronze-700">
        {formatCNY(memberPrice)}
        <span className="ml-1 text-xs font-normal text-bronze-600/70">
          会员价
        </span>
      </span>
      <span className="text-xs text-bark-400">门市 {formatCNY(price)}</span>
    </span>
  );
}

function MountainArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 60"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4 54 C 20 40, 28 30, 40 34 C 52 38, 56 20, 68 14 C 80 8, 92 26, 100 34 C 108 42, 112 48, 116 54"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M10 54 C 30 46, 48 48, 62 44 C 80 39, 100 44, 114 50"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.6"
      />
      <circle
        cx="92"
        cy="14"
        r="5"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.7"
      />
    </svg>
  );
}
