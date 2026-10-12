export function ServiceUnavailable({ retryHref }: { retryHref: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-serif text-2xl text-bark-800">服务暂时不可用</p>
      <p className="max-w-sm text-sm leading-relaxed text-bark-500">
        此刻无法确认你的登录状态。这是网络异常，不代表账号失效，因此没有把你跳转到登录页。
      </p>
      <a
        href={retryHref}
        className="mt-2 rounded-full border border-bronze-300 px-5 py-2 text-sm text-bronze-800 transition-colors hover:bg-bronze-100"
      >
        重新载入
      </a>
    </div>
  );
}
