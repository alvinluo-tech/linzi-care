"use client";

import { useState } from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  toolbarExtra?: React.ReactNode;
  /**
   * 窄屏（< md）下每行的卡片渲染。
   *
   * 为什么需要它：表头/单元格都带 whitespace-nowrap，在 390px 的手机上
   * 表格固有宽度远超容器，最右侧的「操作」列会被推到屏幕外，必须左右拖动才能点到，
   * 掌柜在手机上会以为操作入口不存在。横向滚动在数据表里是可用性陷阱，
   * 因此在窄屏改为「一条记录一张卡」的纵向堆叠：所有字段与操作都在首屏可达。
   *
   * 传入后：md 及以上仍渲染表格（保留排序/分页/搜索），md 以下渲染卡片。
   */
  renderMobileCard?: (row: TData) => React.ReactNode;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "输入关键词即时检索...",
  emptyText = "暂无数据",
  toolbarExtra,
  renderMobileCard,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-4">
      {/* 搜索工具栏与自定义过滤插槽 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          {searchKey ? (
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-bark-400" />
              <Input
                placeholder={searchPlaceholder}
                value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
                onChange={(event) =>
                  table.getColumn(searchKey)?.setFilterValue(event.target.value)
                }
                className="h-9 pl-8 text-xs bg-card"
              />
            </div>
          ) : (
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-bark-400" />
              <Input
                placeholder={searchPlaceholder}
                value={globalFilter ?? ""}
                onChange={(event) => setGlobalFilter(event.target.value)}
                className="h-9 pl-8 text-xs bg-card"
              />
            </div>
          )}
        </div>
        {toolbarExtra && <div className="flex items-center gap-2">{toolbarExtra}</div>}
      </div>

      {/* 数据表格视图：md 及以上用表格，窄屏用卡片堆叠（见 renderMobileCard 注释） */}
      {renderMobileCard && (
        <div className="space-y-3 md:hidden">
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-border bg-card p-3.5 shadow-xs"
              >
                {renderMobileCard(row.original)}
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-xs text-bark-400">
              {emptyText}
            </div>
          )}
        </div>
      )}

      <div
        className={
          renderMobileCard
            ? "hidden overflow-hidden rounded-xl border border-border bg-card shadow-xs md:block"
            : "overflow-hidden rounded-xl border border-border bg-card shadow-xs"
        }
      >
        <Table>
          <TableHeader className="bg-secondary/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-xs font-serif font-medium text-bark-700">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="transition-colors hover:bg-secondary/30"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-xs text-bark-400">
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* 分页控制栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-bark-500">
        <div className="flex items-center gap-2">
          <span>共 {table.getFilteredRowModel().rows.length} 条记录</span>
          <span>·</span>
          <span>
            第 {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1} 页
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span>每页展示</span>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger className="h-7 w-[72px] text-xs">
                <SelectValue placeholder={table.getState().pagination.pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 30, 50].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize} 条
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              aria-label="首页"
            >
              <ChevronsLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="上一页"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="下一页"
            >
              <ChevronRight className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              aria-label="尾页"
            >
              <ChevronsRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
