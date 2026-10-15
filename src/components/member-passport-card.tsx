import { BrandMark } from "@/components/brand";
import { formatCNY } from "@/lib/format";

interface MemberPassportCardProps {
  name: string;
  memberId: string;
  balance: number;
}

/** 「养身护照」式会员卡：暗色材质 + 金铜圆环点缀，替代干巴巴的余额小卡 */
export function MemberPassportCard({
  name,
  memberId,
  balance,
}: MemberPassportCardProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-bark-700 bg-bark-800 text-ivory shadow-lg shadow-bark-900/20">
      <div className="absolute inset-0 bg-gradient-to-br from-bark-700/90 via-bark-800 to-bark-900" />
      <div className="absolute -right-12 -top-12 size-44 rounded-full border border-bronze-500/25" />
      <div className="absolute -right-8 -top-8 size-44 rounded-full border border-bronze-500/15" />
      <div className="absolute -bottom-16 -left-10 size-40 rounded-full bg-bronze-500/10 blur-2xl" />

      <div className="relative p-6 md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] tracking-[0.45em] text-bronze-300">
              LINZI WELLNESS PASS
            </p>
            <p className="mt-2.5 font-serif text-2xl leading-snug">
              {name} 的养身护照
            </p>
          </div>
          {/* 去掉 /90：半透明会把金色印章压到 3.12:1 */}
          <BrandMark className="size-11 shrink-0 text-bronze-300" />
        </div>

        <div className="mt-9 flex flex-wrap items-end justify-between gap-3">
          <div>
            {/* 深底上要用 bark-200：bark-300 在 bark-800 上只有 3.44:1 */}
            <p className="text-xs text-bark-200">会员余额 · 到店消费自动核销</p>
            <p className="mt-1.5 font-serif text-4xl text-bronze-200">
              {formatCNY(balance)}
            </p>
          </div>
          <p className="font-mono text-[11px] tracking-wider text-bark-200">
            NO.{memberId.slice(0, 8).toUpperCase()}
          </p>
        </div>
      </div>
    </div>
  );
}
