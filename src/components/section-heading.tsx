import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  sub?: string;
  align?: "left" | "center";
  /** dark 用于深色板块 */
  tone?: "light" | "dark";
  moreHref?: string;
  moreLabel?: string;
}

/** 统一的章节标题：眉标（宽字距小字）+ 衬线大标题 + 引导句，建立全站叙事节奏 */
export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = "left",
  tone = "light",
  moreHref,
  moreLabel,
}: SectionHeadingProps) {
  const isCenter = align === "center";
  const isDark = tone === "dark";

  return (
    <div
      className={cn(
        isCenter ? "text-center" : "flex flex-wrap items-end justify-between gap-6"
      )}
    >
      <div className={cn(isCenter && "mx-auto max-w-2xl")}>
        <p
          className={cn(
            "text-[11px] font-medium tracking-[0.5em]",
            isDark ? "text-bronze-300" : "text-bronze-600"
          )}
        >
          {eyebrow}
        </p>
        <h2
          className={cn(
            "mt-3 font-serif text-3xl leading-snug md:text-4xl",
            isDark ? "text-ivory" : "text-bark-800"
          )}
        >
          {title}
        </h2>
        {sub && (
          <p
            className={cn(
              "mt-4 text-sm leading-loose",
              isDark ? "text-bark-200" : "text-bark-500",
              isCenter && "mx-auto max-w-xl"
            )}
          >
            {sub}
          </p>
        )}
      </div>
      {moreHref && moreLabel && (
        <Link
          href={moreHref}
          className={cn(
            "group flex items-center gap-1 text-sm",
            isDark
              ? "text-bark-200 hover:text-bronze-200"
              : "text-bark-500 hover:text-bronze-600"
          )}
        >
          {moreLabel}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
