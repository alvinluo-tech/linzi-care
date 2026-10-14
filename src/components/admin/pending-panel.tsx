"use client";

import { Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatRelativeFromNow, formatTime } from "@/lib/format";
import type { AppointmentWithRefs } from "@/lib/types";

/**
 * 掌柜接单专区（仪表盘上的待确认预约栏）。
 *
 * 从仪表盘页面抽出：约 140 行，含空态引导、加载骨架与客单卡片三层布局。
 * 页面只需给出数据与"点击处理"回调，以及一个会走动的 now（用于「3 分钟前」）。
 *
 * id="pending-panel" 保留在本组件根节点上：手机顶栏的「N 单待接」徽标靠
 * `#pending-panel` 锚点直达这里，高亮态由 arrivedAtPanel 控制。
 */
export function PendingPanel({
  appointments,
  now,
  arrivedAtPanel,
  onSelect,
}: {
  /** null = 还在加载（渲染骨架），[] = 确实没有待确认单（渲染空态引导） */
  appointments: AppointmentWithRefs[] | null;
  /** 当前时间戳，用于「3 分钟前」。null 表示尚未在客户端取值 */
  now: number | null;
  /** 从徽标锚点跳进来时高亮本区，让老板一眼确认落点 */
  arrivedAtPanel: boolean;
  onSelect: (a: AppointmentWithRefs) => void;
}) {
  const hasPending = Boolean(appointments && appointments.length > 0);

  return (
    <div
      id="pending-panel"
      className={`scroll-mt-24 overflow-hidden rounded-2xl border p-6 shadow-sm ${
        hasPending
          ? "border-amber-300/80 bg-gradient-to-br from-amber-50/70 via-card to-amber-50/40"
          : "border-border/80 bg-card"
      } ${arrivedAtPanel ? "ring-2 ring-amber-400/70" : ""}`}
    >
      <div
        className={`flex items-center justify-between border-b pb-3.5 ${
          hasPending ? "border-amber-200/70" : "border-border/70"
        }`}
      >
        <div className="flex items-center gap-2">
          <Hourglass
            className={`size-4 ${hasPending ? "text-amber-700" : "text-bark-400"}`}
          />
          <h2
            className={`font-serif text-base font-medium ${
              hasPending ? "text-amber-950" : "text-bark-800"
            }`}
          >
            待确认预约 ({appointments?.length ?? "…"})
          </h2>
        </div>
        <span
          className={`text-xs ${hasPending ? "text-amber-800/80" : "text-bark-400"}`}
        >
          收到顾客预约后，在此确认接单
        </span>
      </div>

      {appointments === null ? (
        <div className="mt-4 space-y-2.5">
          <Skeleton className="h-16 w-full" />
        </div>
      ) : appointments.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-10 text-center">
          <p className="font-serif text-sm text-bark-500">当前没有待确认的预约</p>
          <p className="max-w-md text-xs leading-relaxed text-bark-400">
            顾客在预约页下单后，客单会实时出现在这里（同时收到提示音与手机推送）。
            点击任一客单的「确认接单」即完成确认，顾客会同步收到通知。
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {appointments.map((a) => {
            const ago =
              now === null ? null : formatRelativeFromNow(a.created_at, now);
            // 递出超过 2 小时：老板可能已错过顾客的耐心窗口，标红提醒
            const stale =
              now !== null &&
              now - new Date(a.created_at).getTime() > 2 * 60 * 60 * 1000;
            return (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                className="cursor-pointer rounded-xl border border-amber-200/90 bg-card/90 p-4 transition-all duration-200 hover:border-amber-400 hover:shadow-xs"
                onClick={() => onSelect(a)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(a);
                  }
                }}
              >
                {/* 分三层：身份行 / 时间与技师行 / 操作行。
                    备注单独占一行并截断——内联在时段行里时，顾客随手写两句
                    身体状况就会把「处理此单」按钮挤到下一行，手机上要滑一下
                    才露出来。 */}
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="font-serif text-base font-medium text-bark-800">
                    {a.members?.name ?? "匿名会员"}
                  </span>
                  <span className="font-serif text-xs text-bronze-700">
                    {a.services?.name ?? "理疗服务"}
                  </span>
                  <StatusBadge status={a.status} />
                  {ago && (
                    <span
                      className={`ml-auto shrink-0 font-mono text-[11px] ${
                        stale ? "font-medium text-rose-700" : "text-bark-400"
                      }`}
                      title={`递出于 ${formatDateTime(a.created_at)}`}
                    >
                      {stale ? "⚠ " : ""}
                      {ago}
                    </span>
                  )}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <p className="text-xs text-bark-500">
                    预约时段：{formatTime(a.start_time)} – {formatTime(a.end_time)} ·
                    指派技师：{a.staff?.name ?? "—"}
                    {a.members?.phone ? (
                      <span className="ml-2 font-mono text-bark-400">
                        {a.members.phone}
                      </span>
                    ) : null}
                  </p>
                  <Button
                    size="sm"
                    className="shrink-0 bg-bronze-500 text-xs text-white hover:bg-bronze-600"
                  >
                    处理此单
                  </Button>
                </div>

                {a.remark && (
                  <p
                    className="mt-2 truncate border-t border-amber-100 pt-2 text-xs text-bark-500"
                    title={a.remark}
                  >
                    <span className="text-bark-400">顾客嘱托：</span>
                    {a.remark}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
