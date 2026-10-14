"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Wallet, History, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountActions } from "@/components/admin/account-actions";
import { createClient } from "@/lib/supabase/client";
import { mutate } from "@/lib/supabase/query";
import { formatCNY, formatDateTime } from "@/lib/format";
import type { Members } from "@/lib/types";
import { cn } from "@/lib/utils";

/** 表格动作回调：由页面提供，列定义只负责渲染与转发 */
export interface MemberColumnActions {
  onAdjustBalance: (m: Members) => void;
  onOpenLogs: (m: Members) => void;
  onOpenPasses: (m: Members) => void;
  onEdit: (m: Members) => void;
  onChanged: () => void;
}

/**
 * 会员名籍表格的列定义。
 *
 * 从页面主体抽出：这张表有 5 列、含排序按钮与 5 个行内动作，占页面近 150 行，
 * 且与页面的状态管理（哪些弹窗打开、余额表单内容）无关 —— 只通过 actions 回调交互。
 * 抽成独立 hook 后页面主体聚焦于"数据加载 + 弹窗编排"。
 */
export function useMemberColumns(actions: MemberColumnActions) {
  const {
    onAdjustBalance,
    onOpenLogs,
    onOpenPasses,
    onEdit,
    onChanged,
  } = actions;

  return useMemo<ColumnDef<Members>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 text-xs font-serif font-medium text-bark-800"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            会员尊称
            <ArrowUpDown className="ml-1 size-3 text-bark-400" />
          </Button>
        ),
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div>
              <p className="font-serif font-medium text-bark-800">{m.name}</p>
              <p className="text-[11px] text-bark-400">
                {m.note ? m.note : formatDateTime(m.created_at) + " 入籍"}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: "phone",
        header: "联系电话 / 登录账号",
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div className="text-xs">
              <p className="font-medium text-bark-700">{m.phone ?? "未留手机"}</p>
              <p className="font-mono text-[11px] text-bark-400">{m.email ?? ""}</p>
            </div>
          );
        },
      },
      {
        accessorKey: "balance",
        header: ({ column }) => (
          <div className="text-right">
            <Button
              variant="ghost"
              size="sm"
              className="-mr-3 h-8 text-xs font-serif font-medium text-bark-800"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              账户余额
              <ArrowUpDown className="ml-1 size-3 text-bark-400" />
            </Button>
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-right">
            <span className="font-serif text-base font-semibold text-bronze-700">
              {formatCNY(row.original.balance)}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "is_active",
        header: "会籍状态",
        cell: ({ row }) => {
          const active = row.original.is_active;
          return (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide",
                active
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-stone-300 bg-stone-100 text-stone-500"
              )}
            >
              {active ? "正籍有效" : "休眠停用"}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">操作手令</div>,
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-bronze-700 hover:bg-bronze-50"
                onClick={() => onAdjustBalance(m)}
              >
                <Wallet className="mr-1 size-3 text-bronze-600" /> 调余额
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-bark-600 hover:bg-secondary"
                onClick={() => onOpenLogs(m)}
              >
                <History className="mr-1 size-3 text-bark-400" /> 变动流水
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-bark-600 hover:bg-secondary"
                onClick={() => onOpenPasses(m)}
              >
                <Ticket className="size-3" />
                权益
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-bark-600 hover:bg-secondary"
                onClick={() => onEdit(m)}
              >
                编辑
              </Button>
              <AccountActions
                userId={m.user_id}
                email={m.email}
                active={m.is_active}
                name={m.name}
                onToggleBusiness={async (active) => {
                  const { error } = await mutate(() =>
                    createClient()
                      .from("members")
                      .update({ is_active: active })
                      .eq("id", m.id)
                  );
                  if (error) throw new Error(error.message);
                }}
                onChanged={onChanged}
              />
            </div>
          );
        },
      },
    ],
    [onAdjustBalance, onOpenLogs, onOpenPasses, onEdit, onChanged]
  );
}
