"use client";

import { Button } from "@/components/ui/button";

/** 区段级错误兜底：渲染抛错时不再露出 Next 默认英文错误页 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-serif text-2xl text-bark-800">页面加载出错</p>
      <p className="max-w-md text-sm leading-relaxed text-bark-500">
        {error.message || "发生了未预期的异常，已记录到服务端日志。"}
      </p>
      <Button onClick={reset}>重新载入</Button>
    </div>
  );
}
