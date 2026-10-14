"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCNY, STOCK_STATUS_META } from "@/lib/format";
import type { ProductWithCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ProductColumnActions {
  onEdit: (p: ProductWithCategory) => void;
  onRemove: (p: ProductWithCategory) => void;
}

/**
 * 好物商品表格的列定义。
 *
 * 从页面抽出：6 列含排序按钮与 2 个行内动作，占页面约 145 行，
 * 与页面的表单/品类管理状态无关，只通过 actions 回调交互。
 */
export function productColumns(
  actions: ProductColumnActions
): ColumnDef<ProductWithCategory>[] {
  const { onEdit, onRemove } = actions;

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
          好物商品
          <ArrowUpDown className="ml-1 size-3 text-bark-400" />
        </Button>
      ),
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="size-11 shrink-0 overflow-hidden rounded-lg border border-border/80 bg-gradient-to-br from-bark-100 to-bronze-100 shadow-2xs">
              {p.image_url ? (
                // 商品图来自后台填写的任意外链，无法预知域名，
                // 用原生 img 避免为 next/image 维护一份远程域名白名单。
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image_url}
                  alt={p.name}
                  className="size-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="flex size-full items-center justify-center font-serif text-sm text-bark-400">
                  {p.name.slice(0, 1)}
                </span>
              )}
            </div>
            <div>
              <p className="font-serif font-medium text-bark-800">{p.name}</p>
              <p className="line-clamp-1 max-w-64 text-[11px] text-bark-400">
                {p.description ?? "暂无详述"}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "category_id",
      header: "好物品类",
      cell: ({ row }) => {
        const cat = row.original.product_categories?.name;
        return cat ? (
          <span className="rounded-md bg-secondary/80 px-2 py-0.5 text-xs text-bark-600">
            {cat}
          </span>
        ) : (
          <span className="text-xs text-bark-400">未分类</span>
        );
      },
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
            橱窗标价
            <ArrowUpDown className="ml-1 size-3 text-bark-400" />
          </Button>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <span className="font-serif text-sm font-semibold text-bronze-700">
            {formatCNY(row.original.price)}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "stock_status",
      header: "库存储备",
      cell: ({ row }) => {
        const st = row.original.stock_status;
        const meta = STOCK_STATUS_META[st];
        return (
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide",
              meta?.badge ?? "border-border text-bark-500"
            )}
          >
            {meta?.label ?? st}
          </span>
        );
      },
    },
    {
      accessorKey: "is_active",
      header: "展示状态",
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
            {active ? "在架展示" : "下架隐匿"}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: () => <div className="text-right">操作手令</div>,
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-bark-700 hover:bg-secondary"
              onClick={() => onEdit(p)}
            >
              <Edit className="mr-1 size-3 text-bark-400" /> 编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-rose-700 hover:bg-rose-50"
              onClick={() => onRemove(p)}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        );
      },
    },
  ];
}
