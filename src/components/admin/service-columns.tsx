"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Edit, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCNY, formatDuration } from "@/lib/format";
import type { Services } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ServiceColumnActions {
  onEdit: (s: Services) => void;
  onConfigStaff: (s: Services) => void;
  onRemove: (s: Services) => void;
}

/**
 * 服务项目表格的列定义。
 *
 * 从页面抽出：5 列含排序按钮与 3 个行内动作，占页面约 145 行，
 * 与页面的表单/弹窗状态无关，只通过 actions 回调交互。
 */
export function serviceColumns(
  actions: ServiceColumnActions
): ColumnDef<Services>[] {
  const { onEdit, onConfigStaff, onRemove } = actions;

  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 text-xs font-serif font-medium text-bark-800"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          服务名称
          <ArrowUpDown className="ml-1 size-3 text-bark-400" />
        </Button>
      ),
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div>
            <p className="font-serif font-medium text-bark-800">{s.name}</p>
            <p className="line-clamp-1 max-w-72 text-[11px] text-bark-400">
              {s.description ?? "暂无详述"}
            </p>
          </div>
        );
      },
    },
    {
      accessorKey: "category",
      header: "所属调理品类",
      cell: ({ row }) => {
        const cat = row.original.category;
        return cat ? (
          <span className="rounded-md bg-secondary/80 px-2 py-0.5 text-xs text-bark-600">
            {cat}
          </span>
        ) : (
          <span className="text-xs text-bark-400">常规调养</span>
        );
      },
    },
    {
      accessorKey: "duration",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 text-xs font-serif font-medium text-bark-800"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          调理时长
          <ArrowUpDown className="ml-1 size-3 text-bark-400" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="text-xs text-bark-600 font-mono">
          {formatDuration(row.original.duration)}
        </span>
      ),
    },
    {
      accessorKey: "price",
      header: ({ column }) => (
        <div className="text-right">
          <Button
            variant="ghost"
            size="sm"
            className="-mr-3 h-8 text-xs font-serif font-medium text-bark-800"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            门市价 / 会员价
            <ArrowUpDown className="ml-1 size-3 text-bark-400" />
          </Button>
        </div>
      ),
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="text-right">
            <span className="font-serif text-sm font-semibold text-bronze-700">
              {formatCNY(s.price)}
            </span>
            {s.member_price != null && (
              <p className="text-[11px] text-bark-400 font-medium">
                会籍 {formatCNY(s.member_price)}
              </p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "is_active",
      header: "上架状态",
      cell: ({ row }) => {
        const s = row.original;
        return (
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide",
              s.is_active
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-stone-300 bg-stone-100 text-stone-500"
            )}
          >
            {s.is_active ? "已上架供选" : "已下架隐藏"}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: () => <div className="text-right">操作手令</div>,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-bark-700 hover:bg-secondary"
              onClick={() => onEdit(s)}
            >
              <Edit className="mr-1 size-3 text-bark-400" /> 编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-bronze-700 hover:bg-bronze-50"
              onClick={() => onConfigStaff(s)}
            >
              <UsersRound className="mr-1 size-3 text-bronze-600" /> 分配技师
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-rose-700 hover:bg-rose-50"
              onClick={() => onRemove(s)}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        );
      },
    },
  ];
}
