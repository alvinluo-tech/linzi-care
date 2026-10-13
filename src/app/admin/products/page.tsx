"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Edit, FolderPlus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/ui/data-table";
import { createClient } from "@/lib/supabase/client";
import { adminGet } from "@/lib/admin/client";
import { mutate } from "@/lib/supabase/query";
import { formatCNY, STOCK_STATUS_META } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProductCategories, ProductWithCategory } from "@/lib/types";

interface ProductForm {
  name: string;
  price: string;
  category_id: string;
  description: string;
  image_url: string;
  stock_status: string;
  sort_order: number;
  is_active: boolean;
}

const EMPTY_FORM: ProductForm = {
  name: "",
  price: "",
  category_id: "none",
  description: "",
  image_url: "",
  stock_status: "in_stock",
  sort_order: 0,
  is_active: true,
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<ProductWithCategory[] | null>(null);
  const [categories, setCategories] = useState<ProductCategories[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ProductWithCategory | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState<string>("all");

  const load = useCallback(async () => {
    const res = await adminGet<{
      products: ProductWithCategory[];
      categories: ProductCategories[];
      error?: string;
    }>("/products");
    if (res.error) {
      toast.error("商品数据加载失败", { description: res.error.message });
      setProducts([]);
      setCategories([]);
      return;
    }
    setProducts(res.data?.products ?? []);
    setCategories(res.data?.categories ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (selectedCatId === "all") return products;
    if (selectedCatId === "none") return products.filter((p) => !p.category_id);
    return products.filter((p) => p.category_id === selectedCatId);
  }, [products, selectedCatId]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setCreateOpen(true);
  };

  const openEdit = (product: ProductWithCategory) => {
    setForm({
      name: product.name,
      price: String(product.price),
      category_id: product.category_id ?? "none",
      description: product.description ?? "",
      image_url: product.image_url ?? "",
      stock_status: product.stock_status,
      sort_order: product.sort_order,
      is_active: product.is_active,
    });
    setEditing(product);
  };

  const submitForm = async () => {
    setSubmitting(true);
    const payload = {
      name: form.name.trim(),
      price: Number(form.price),
      category_id: form.category_id === "none" ? null : form.category_id,
      description: form.description.trim() || null,
      image_url: form.image_url.trim() || null,
      stock_status: form.stock_status,
      sort_order: form.sort_order,
      is_active: form.is_active,
    };
    const supabase = createClient();
    const { error } = editing
      ? await mutate(() => supabase.from("products").update(payload).eq("id", editing.id))
      : await mutate(() => supabase.from("products").insert(payload));
    setSubmitting(false);
    if (error) {
      toast.error("保存失败", { description: error.message });
      return;
    }
    toast.success("好物商品已保存");
    setCreateOpen(false);
    setEditing(null);
    void load();
  };

  const remove = async (product: ProductWithCategory) => {
    const { error } = await mutate(() =>
      createClient().from("products").delete().eq("id", product.id)
    );
    if (error) {
      toast.error("删除失败（可选择直接下架）", { description: error.message });
      return;
    }
    toast.success("已删除该商品");
    void load();
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    const { error } = await mutate(() =>
      createClient()
        .from("product_categories")
        .insert({ name: newCategory.trim(), sort_order: categories.length + 1 })
    );
    if (error) {
      toast.error("添加品类失败", { description: error.message });
      return;
    }
    setNewCategory("");
    toast.success("新商品品类已添加");
    void load();
  };

  const removeCategory = async (category: ProductCategories) => {
    const { error } = await mutate(() =>
      createClient().from("product_categories").delete().eq("id", category.id)
    );
    if (error) {
      toast.error("删除品类失败", { description: error.message });
      return;
    }
    toast.success("品类已删除（关联商品自动转为未分类）");
    void load();
  };

  const columns = useMemo<ColumnDef<ProductWithCategory>[]>(
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="size-full object-cover"
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
                onClick={() => openEdit(p)}
              >
                <Edit className="mr-1 size-3 text-bark-400" /> 编辑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-rose-700 hover:bg-rose-50"
                onClick={() => void remove(p)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          );
        },
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      {/* 头部控制 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="size-5 text-bronze-600" />
            <h1 className="font-serif text-2xl text-bark-800">颐养商城好物管理</h1>
          </div>
          <p className="mt-1 text-xs text-bark-400">
            线上纯展示橱窗 · 到店咨询选购 · 统一管控品类与库存供销状态
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCategoryOpen(true)}
            className="h-9 text-xs"
          >
            <FolderPlus className="mr-1.5 size-3.5 text-bark-500" /> 品类分类维护
          </Button>
          <Button
            onClick={openCreate}
            size="sm"
            className="h-9 bg-bronze-500 text-xs text-white hover:bg-bronze-600"
          >
            <Plus className="mr-1 size-3.5" /> 录入新好物
          </Button>
        </div>
      </div>

      {/* 品类快速切换栏 */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/40 pb-2 text-xs">
        <span className="mr-2 font-serif text-bark-500">品类速览：</span>
        <button
          type="button"
          onClick={() => setSelectedCatId("all")}
          className={cn(
            "rounded-md px-3 py-1 text-xs transition-colors",
            selectedCatId === "all"
              ? "bg-bronze-500 font-medium text-white shadow-xs"
              : "border border-border bg-card text-bark-600 hover:border-bronze-300"
          )}
        >
          全部商品 ({products?.length ?? 0})
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSelectedCatId(c.id)}
            className={cn(
              "rounded-md px-3 py-1 text-xs transition-colors",
              selectedCatId === c.id
                ? "bg-bronze-500 font-medium text-white shadow-xs"
                : "border border-border bg-card text-bark-600 hover:border-bronze-300"
            )}
          >
            {c.name} ({products?.filter((p) => p.category_id === c.id).length ?? 0})
          </button>
        ))}
      </div>

      {/* TanStack Table */}
      {products === null ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-xs">
          <Skeleton className="h-9 w-64" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filteredProducts}
          searchPlaceholder="输入好物名称即时检索..."
          emptyText="当前品类下暂无展示商品"
          renderMobileCard={(p) => (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="size-11 shrink-0 overflow-hidden rounded-lg border border-border/80 bg-gradient-to-br from-bark-100 to-bronze-100 shadow-2xs">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt={p.name} className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center font-serif text-sm text-bark-400">
                      {p.name.slice(0, 1)}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-serif font-medium text-bark-800">{p.name}</p>
                  <p className="line-clamp-2 text-[11px] text-bark-400">
                    {p.description ?? "暂无详述"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-secondary/80 px-2 py-0.5 text-[11px] text-bark-600">
                      {p.product_categories?.name ?? "未分类"}
                    </span>
                    {(() => {
                      const meta = STOCK_STATUS_META[p.stock_status];
                      return (
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide",
                            meta?.badge ?? "border-border text-bark-500"
                          )}
                        >
                          {meta?.label ?? p.stock_status}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-serif text-base font-semibold leading-tight text-bronze-700">
                    {formatCNY(p.price)}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-[10px] font-medium",
                      p.is_active ? "text-emerald-700" : "text-bark-400"
                    )}
                  >
                    {p.is_active ? "在架展示" : "下架隐匿"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 text-xs text-bark-700"
                  onClick={() => openEdit(p)}
                >
                  <Edit className="mr-1 size-3 text-bark-400" /> 编辑好物
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 basis-[38%] text-xs text-rose-700"
                  onClick={() => void remove(p)}
                >
                  <Trash2 className="mr-1 size-3" /> 删除
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {/* 新增/编辑好物 */}
      <Dialog
        open={createOpen || Boolean(editing)}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {editing ? "编辑好物商品" : "录入新好物"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">
                商品名称<span className="ml-0.5 text-rose-600">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-9 text-xs"
                placeholder="例如：红枣枸杞养气茶"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  橱窗标价（元）<span className="ml-0.5 text-rose-600">*</span>
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">所属品类</Label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-xs focus-visible:outline-ring/50"
                >
                  <option value="none">未归类</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">现货库存状态</Label>
                <select
                  value={form.stock_status}
                  onChange={(e) => setForm({ ...form, stock_status: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-xs focus-visible:outline-ring/50"
                >
                  <option value="in_stock">现货充裕 (在售)</option>
                  <option value="low_stock">存量紧张</option>
                  <option value="out_of_stock">暂时售罄</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">排序权重（越小越前）</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm({ ...form, sort_order: Number(e.target.value) })
                  }
                  className="h-9 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">商品图集外链（选填）</Label>
              <Input
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://..."
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">好物详述与功效说明</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="text-xs"
                placeholder="阐明产地配方、口感香气或日常养生冲泡/佩戴建议"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2">
              <span className="text-xs text-bark-600">上架至颐养商城橱窗</span>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCreateOpen(false);
                setEditing(null);
              }}
            >
              取消
            </Button>
            <Button
              onClick={submitForm}
              size="sm"
              disabled={submitting || !form.name.trim() || form.price === ""}
              className="bg-bronze-500 text-white hover:bg-bronze-600"
            >
              {submitting ? "保存中…" : "确认录入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 品类分类管理弹窗 */}
      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">好物品类分类维护</DialogTitle>
            <DialogDescription>删除分类后，原属该分类的商品将自动移至「未分类」</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-border bg-paper/50 px-3 py-2 text-xs"
              >
                <span className="font-serif font-medium text-bark-800">{c.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] text-rose-700 hover:bg-rose-50"
                  onClick={() => void removeCategory(c)}
                >
                  删除
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t border-border/60">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="新增品类名（如：节气时令）"
              className="h-8 text-xs"
            />
            <Button variant="outline" size="sm" onClick={addCategory} className="h-8 text-xs shrink-0">
              添加品类
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
