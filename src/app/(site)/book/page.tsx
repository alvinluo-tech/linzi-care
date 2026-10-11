import { Suspense } from "react";
import type { Metadata } from "next";
import { PageLoader } from "@/components/brand";
import { BookingWizard } from "@/components/book/booking-wizard";

export const metadata: Metadata = { title: "预约体验" };

export default function BookPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-16">
      <div className="text-center">
        <p className="text-xs tracking-[0.4em] text-bronze-600">RESERVATION</p>
        <h1 className="mt-3 font-serif text-3xl text-bark-800 md:text-4xl">
          预约体验
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-bark-500">
          选项目 → 选技师 → 选时间 → 确认，四步完成预约，提交后待店家确认。
        </p>
      </div>

      <div className="mt-10">
        <Suspense fallback={<PageLoader label="准备预约…" />}>
          <BookingWizard />
        </Suspense>
      </div>
    </div>
  );
}
