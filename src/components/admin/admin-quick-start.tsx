"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  BookOpenText,
  CheckCheck,
  CalendarClock,
  Coins,
  UsersRound,
  BellRing,
} from "lucide-react";

/**
 * 掌柜速览 —— 面向「第一次上手」的老板的操作说明。
 *
 * 设计取舍：
 * - 默认折叠。老板熟悉之后这段文字就是噪音，折叠态只占一行，不打扰日常。
 * - 用 <details> 而非新建 Collapsible 组件：原生语义自带键盘可达性与
 *   「查找即展开」（浏览器页内搜索会展开命中项），无需额外依赖。
 * - 每条一句话 + 一个直达入口。老板要的是「点哪儿」而不是功能清单，
 *   所以每条都配跳转，把说明直接接到动作上。
 * - 五条为上限：超过五条就没人看了。
 */
export function AdminQuickStart() {
  const [open, setOpen] = useState(false);

  return (
    <details
      className="group overflow-hidden rounded-2xl border border-border/80 bg-paper/50 open:bg-card"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bronze-50">
            <BookOpenText className="size-4 text-bronze-600" />
          </span>
          <div>
            <h2 className="font-serif text-base text-bark-800">
              掌柜速览 · 五分钟上手
            </h2>
            <p className="mt-0.5 text-xs text-bark-400">
              {open ? "点标题可收起" : "第一次用？点这里看五件事怎么操作"}
            </p>
          </div>
        </div>
        <ChevronDown
          className={`size-4 shrink-0 text-bark-400 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </summary>

      <div className="space-y-3 border-t border-border/70 px-6 py-5">
        <GuideRow
          icon={CheckCheck}
          title="收到顾客预约 → 确认接单"
          body="顾客下单后会实时出现在上方「待确认预约」并响铃。点任一客单的「确认接单」，顾客立刻收到通知。"
          action={{ href: "#pending-panel", label: "前往待确认区" }}
        />
        <GuideRow
          icon={CalendarClock}
          title="查看全店排期 → 周日历"
          body="周日历一屏看清每位技师的时间占用，点色块即可改派、改期或取消。"
          action={{ href: "/admin/calendar", label: "打开日历" }}
        />
        <GuideRow
          icon={UsersRound}
          title="技师给顾客打点 → 到店 / 完成"
          body="顾客到店由技师在自己手机上点「顾客到店」，服务结束点「完成服务」，系统自动结算并计入营收。老板无需代劳。"
        />
        <GuideRow
          icon={Coins}
          title="会员余额 → 充值与扣减"
          body="在「会员」页调整余额会自动生成流水，每一笔都可追溯。余额字段受数据库触发器保护，前端改不动。"
          action={{ href: "/admin/members", label: "管理会员" }}
        />
        <GuideRow
          icon={BellRing}
          title="别漏掉提醒 → 右上角铃铛"
          body="待确认、通知发送失败、今日待履约都会汇总到铃铛里，有空扫一眼就不会漏事。"
        />
      </div>
    </details>
  );
}

function GuideRow({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  const isAnchor = action?.href.startsWith("#");
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/80 px-4 py-3.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary/70">
        <Icon className="size-3.5 text-bronze-600" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-serif text-sm text-bark-800">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-bark-500">{body}</p>
      </div>
      {action && (
        <Link
          href={action.href}
          onClick={
            isAnchor
              ? (e) => {
                  // 页内锚点默认是瞬时跳转，与 StatCard 的平滑滚动不一致；
                  // 统一成 scrollIntoView，滚动行为才不跳戏。
                  const target = document.querySelector(action.href);
                  if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }
              : undefined
          }
          className="mt-0.5 shrink-0 self-center whitespace-nowrap rounded-full border border-bronze-300/80 px-3 py-1 text-[11px] text-bronze-700 transition-colors hover:bg-bronze-50"
        >
          {isAnchor ? action.label : `${action.label} →`}
        </Link>
      )}
    </div>
  );
}
