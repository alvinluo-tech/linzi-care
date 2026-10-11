"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderPlus, Plus } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
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

  const load = useCallback(async () => {
    const supabase = createClient();
    const [productsRes, categoriesRes] = await Promise.all([
      supabase
        .from("products")
        .select("*, product_categories(id, name)")
        .order("sort_order"),
      supabase.from("product_categories").select("*").order("sort_order"),
    ]);
    setProducts((productsRes.data as unknown as ProductWithCategory[]) ?? []);
    setCategories((categoriesRes.data as ProductCategories[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert(payload);
    setSubmitting(false);
    if (error) {
      toast.error("保存失败", { description: error.message });
      return;
    }
    toast.success("已保存");
    setCreateOpen(false);
    setEditing(null);
    void load();
  };

  const remove = async (product: ProductWithCategory) => {
    const { error } = await createClient()
      .from("products")
      .delete()
      .eq("id", product.id);
    if (error) {
      toast.error("删除失败（可改为下架）", { description: error.message });
      return;
    }
    toast.success("已删除");
    void load();
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    const { error } = await createClient()
      .from("product_categories")
      .insert({ name: newCategory.trim(), sort_order: categories.length + 1 });
    if (error) {
      toast.error("添加失败", { description: error.message });
      return;
    }
    setNewCategory("");
    toast.success("分类已添加");
    void load();
  };

  const removeCategory = async (category: ProductCategories) => {
    const { error } = await createClient()
      .from("product_categories")
      .delete()
      .eq("id", category.id);
    if (error) {
      toast.error("删除失败", { description: error.message });
      return;
    }
    toast.success("分类已删除（商品分类变为未分类）");
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-bark-800">商品管理</h1>
          <p className="mt-1 text-sm text-bark-400">
            商城为纯展示橱窗，不含交易；图片填写外链地址即可
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCategoryOpen(true)}>
            <FolderPlus /> 分类管理
          </Button>
          <Button
            onClick={openCreate}
            className="bg-bronze-500 text-white hover:bg-bronze-600"
          >
            <Plus /> 新增商品
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>商品</TableHead>
              <TableHead>分类</TableHead>
              <TableHead className="text-right">价格</TableHead>
              <TableHead>库存</TableHead>
              <TableHead className="w-20">状态</TableHead>
              <TableHead className="min-w-40">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products === null ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-bark-400">
                  暂无商品
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="size-10 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-bark-100 to-bronze-100">
                        {product.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="size-full object-cover"
                          />
                        ) : (
                          <span className="flex size-full items-center justify-center font-serif text-bark-300">
                            {product.name.slice(0, 1)}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-bark-800">{product.name}</p>
                        <p className="line-clamp-1 max-w-56 text-xs text-bark-400">
                          {product.description ?? "—"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-bark-500">
                    {product.product_categories?.name ?? "未分类"}
                  </TableCell>
                  <TableCell className="text-right font-medium text-bronze-700">
                    {formatCNY(product.price)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded-sm border px-2 py-0.5 text-xs",
                        STOCK_STATUS_META[product.stock_status]?.badge
                      )}
                    >
                      {STOCK_STATUS_META[product.stock_status]?.label ?? product.stock_status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded-sm border px-2 py-0.5 text-xs",
                        product.is_active
                          ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                          : "border-stone-300 bg-stone-200 text-stone-600"
                      )}
                    >
                      {product.is_active ? "上架" : "下架"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(product)}>
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-700 hover:bg-rose-50"
                        onClick={() => void remove(product)}
                      >
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 新增/编辑商品 */}
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
              {editing ? "编辑商品" : "新增商品"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                商品名称<span className="ml-0.5 text-rose-600">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  价格（元）<span className="ml-0.5 text-rose-600">*</span>
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>分类</Label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-ring/50"
                >
                  <option value="none">未分类</option>
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
                <Label>库存状态</Label>
                <select
                  value={form.stock_status}
                  onChange={(e) => setForm({ ...form, stock_status: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-ring/50"
                >
                  <option value="in_stock">在售</option>
                  <option value="low_stock">库存紧张</option>
                  <option value="out_of_stock">已售罄</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>排序（越小越靠前）</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm({ ...form, sort_order: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>图片链接（选填）</Label>
              <Input
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>商品介绍</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-md bg-secondary/60 px-3 py-2">
              <span className="text-sm text-bark-600">上架（商城可见）</span>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                setEditing(null);
              }}
            >
              取消
            </Button>
            <Button
              onClick={submitForm}
              disabled={submitting || !form.name.trim() || form.price === ""}
              className="bg-bronze-500 text-white hover:bg-bronze-600"
            >
              {submitting ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 分类管理 */}
      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">商品分类</DialogTitle>
            <DialogDescription>删除分类后，其商品变为「未分类」</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <span className="text-sm text-bark-700">{c.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-700 hover:bg-rose-50"
                  onClick={() => void removeCategory(c)}
                >
                  删除
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="新分类名称"
            />
            <Button variant="outline" onClick={addCategory}>
              添加
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
