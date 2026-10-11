import { cn } from "@/lib/utils";

/** 细金线印章品牌标 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect
        x="1.5"
        y="1.5"
        width="37"
        height="37"
        rx="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <text
        x="20"
        y="27.5"
        textAnchor="middle"
        fontSize="19"
        fill="currentColor"
        fontFamily="'Noto Serif SC', 'Songti SC', 'SimSun', serif"
        fontWeight="600"
      >
        梓
      </text>
    </svg>
  );
}

/** 传统朱文古风小印章 */
export function SealMark({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex flex-col items-center justify-center border border-bronze-600/80 bg-bronze-50/60 px-1.5 py-1 text-center font-serif text-[11px] leading-tight tracking-widest text-bronze-800 shadow-[0_1px_2px_rgba(184,134,11,0.08)]",
        className
      )}
      aria-hidden="true"
    >
      {text.split("").map((char, i) => (
        <span key={i} className="block">
          {char}
        </span>
      ))}
    </div>
  );
}

/** 雅致分隔装饰：极细线条 + 空心菱形 */
export function OrnamentDivider({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)} aria-hidden="true">
      <span className="h-px flex-1 bg-border/80" />
      <span className="size-1.5 rotate-45 border border-bronze-500/70" />
      <span className="h-px flex-1 bg-border/80" />
    </div>
  );
}

/** 新中式意境线描：头疗·汤泉水纹经络 */
export function HeadSpaArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 100" fill="none" className={className} aria-hidden="true">
      <path
        d="M20 75 C 45 60, 60 85, 85 70 C 110 55, 125 78, 145 68"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M30 85 C 55 72, 70 92, 95 80 C 115 70, 130 88, 150 78"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.5"
      />
      <circle cx="80" cy="38" r="16" stroke="currentColor" strokeWidth="1" opacity="0.6" strokeDasharray="2 3" />
      <path
        d="M80 18 L80 58 M60 38 L100 38"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.4"
      />
      <path
        d="M68 28 C 76 22, 84 22, 92 28 C 88 34, 72 34, 68 28 Z"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.3"
      />
    </svg>
  );
}

/** 新中式意境线描：美容·莲花润颜凝露 */
export function BeautyArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 100" fill="none" className={className} aria-hidden="true">
      {/* 莲瓣外廓 */}
      <path
        d="M80 20 C 65 38, 55 60, 80 80 C 105 60, 95 38, 80 20 Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* 左瓣 */}
      <path
        d="M80 50 C 60 52, 42 62, 50 76 C 62 82, 74 76, 80 72"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.6"
      />
      {/* 右瓣 */}
      <path
        d="M80 50 C 100 52, 118 62, 110 76 C 98 82, 86 76, 80 72"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.6"
      />
      {/* 水滴凝露 */}
      <circle cx="80" cy="34" r="3" fill="currentColor" opacity="0.7" />
      <path
        d="M35 88 C 65 84, 95 84, 125 88"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}

/** 新中式意境线描：养生·扶阳温煦艾火 */
export function WellnessArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 100" fill="none" className={className} aria-hidden="true">
      {/* 艾火升温外轮廓 */}
      <path
        d="M80 16 C 88 28, 98 36, 96 50 C 94 65, 82 72, 80 74 C 78 72, 66 65, 64 50 C 62 36, 72 28, 80 16 Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* 内火温气 */}
      <path
        d="M80 34 C 84 42, 88 46, 86 54 C 84 62, 76 65, 80 68"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.6"
      />
      {/* 经络圆环 */}
      <circle cx="80" cy="52" r="30" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 4" opacity="0.35" />
      {/* 底座沉香温案 */}
      <path
        d="M30 84 L130 84 M45 88 L115 88"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}

/** 页面加载中占位 */
export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <BrandMark className="size-10 animate-pulse text-bronze-600" />
      <p className="text-sm text-muted-foreground">{label ?? "加载中…"}</p>
    </div>
  );
}
