"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Edit, Plus, Sparkles, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatCNY, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Services, Staff, StaffServices } from "@/lib/types";

interface ServiceForm {
  name: string;
  category: string;
  duration: number;
  price: string;
  memberPrice: string;
  description: string;
  sort_order: number;
  is_active: boolean;
}

const EMPTY_FORM: ServiceForm = {
  name: "",
  category: "",
  duration: 60,
  price: "",
  memberPrice: "",
  description: "",
  sort_order: 0,
  is_active: true,
};

export default function AdminServicesPage() {
  const [services, setServices] = useState<Services[] | null>(null);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [links, setLinks] = useState<StaffServices[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Services | null>(null);
  const [form, setForm] = useState<ServiceForm>(EMPTY_FORM);
  const [configTarget, setConfigTarget] = useState<Services | null>(null);
  const [configChecked, setConfigChecked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const load = useCallback(async () => {
    const res = await adminGet<{
      services: Services[];
      staff: Staff[];
      staff_services: StaffServices[];
      error?: string;
    }>("/services");
    if (res.error) {
      toast.error("服务项目加载失败", { description: res.error.message });
      setServices([]);
      setStaffList([]);
      setLinks([]);
      return;
    }
    setServices(res.data?.services ?? []);
    setStaffList(res.data?.staff ?? []);
    setLinks(res.data?.staff_services ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => {
    if (!services) return [];
    const set = new Set<string>();
    services.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set);
  }, [services]);

  const filteredServices = useMemo(() => {
    if (!services) return [];
    if (selectedCategory === "all") return services;
    return services.filter((s) => s.category === selectedCategory);
  }, [services, selectedCategory]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setCreateOpen(true);
  };

  const openEdit = (service: Services) => {
    setForm({
      name: service.name,
      category: service.category ?? "",
      duration: service.duration,
      price: String(service.price),
      memberPrice: service.member_price == null ? "" : String(service.member_price),
      description: service.description ?? "",
      sort_order: service.sort_order,
      is_active: service.is_active,
    });
    setEditing(service);
  };

  const submitForm = async () => {
    setSubmitting(true);
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      duration: form.duration,
      price: Number(form.price),
      member_price: form.memberPrice === "" ? null : Number(form.memberPrice),
      description: form.description.trim() || null,
      sort_order: form.sort_order,
      is_active: form.is_active,
    };
    const supabase = createClient();
    const { error } = editing
      ? await mutate(() => supabase.from("services").update(payload).eq("id", editing.id))
      : await mutate(() => supabase.from("services").insert(payload));
    setSubmitting(false);
    if (error) {
      toast.error("保存失败", { description: error.message });
      return;
    }
    toast.success("服务项目已成功保存");
    setCreateOpen(false);
    setEditing(null);
    void load();
  };

  const openConfig = (service: Services) => {
    setConfigTarget(service);
    setConfigChecked(
      new Set(
        links.filter((l) => l.service_id === service.id).map((l) => l.staff_id)
      )
    );
  };

  const toggleConfig = async (staffId: string, checked: boolean) => {
    if (!configTarget) return;
    setConfigChecked((prev) => {
      const next = new Set(prev);
      if (checked) next.add(staffId);
      else next.delete(staffId);
      return next;
    });
    const supabase = createClient();
    if (checked) {
      const { error } = await mutate(() =>
        supabase
          .from("staff_services")
          .insert({ staff_id: staffId, service_id: configTarget.id })
      );
      if (error && !error.message.includes("duplicate")) {
        toast.error("技师关联失败", { description: error.message });
        return;
      }
    } else {
      const { error } = await mutate(() =>
        supabase
          .from("staff_services")
          .delete()
          .eq("staff_id", staffId)
          .eq("service_id", configTarget.id)
      );
      if (error) {
        toast.error("解绑失败", { description: error.message });
        return;
      }
    }
    void load();
  };

  const remove = async (service: Services) => {
    const { error } = await mutate(() =>
      createClient().from("services").delete().eq("id", service.id)
    );
    if (error) {
      toast.error("删除失败（若已被预约，建议改为下架状态）", { description: error.message });
      return;
    }
    toast.success("已删除该服务项目");
    void load();
  };

  // 不做 memo：列定义里捕获的 openConfig 依赖 links 状态，
  // 一旦被 useMemo([]) 冻结就会永远读到首帧的空数组。
  const columns: ColumnDef<Services>[] = [
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
                onClick={() => openEdit(s)}
              >
                <Edit className="mr-1 size-3 text-bark-400" /> 编辑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-bronze-700 hover:bg-bronze-50"
                onClick={() => openConfig(s)}
              >
                <UsersRound className="mr-1 size-3 text-bronze-600" /> 分配技师
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-rose-700 hover:bg-rose-50"
                onClick={() => void remove(s)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          );
        },
      },
  ];

  return (
    <div className="space-y-6">
      {/* 头部控制 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-bronze-600" />
            <h1 className="font-serif text-2xl text-bark-800">服务项目与手艺配置</h1>
          </div>
          <p className="mt-1 text-xs text-bark-400">
            调配养生服务目录、门市与会员双轨标价，并授权指派可接单技师
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="h-9 bg-bronze-500 text-xs text-white hover:bg-bronze-600"
        >
          <Plus className="mr-1 size-3.5" /> 新增调理服务
        </Button>
      </div>

      {/* 品类快速切换 Tab */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/40 pb-2 text-xs">
        <span className="mr-2 font-serif text-bark-500">品类速滤：</span>
        <button
          type="button"
          onClick={() => setSelectedCategory("all")}
          className={cn(
            "rounded-md px-3 py-1 text-xs transition-colors",
            selectedCategory === "all"
              ? "bg-bronze-500 font-medium text-white shadow-xs"
              : "border border-border bg-card text-bark-600 hover:border-bronze-300"
          )}
        >
          全部服务 ({services?.length ?? 0})
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setSelectedCategory(c)}
            className={cn(
              "rounded-md px-3 py-1 text-xs transition-colors",
              selectedCategory === c
                ? "bg-bronze-500 font-medium text-white shadow-xs"
                : "border border-border bg-card text-bark-600 hover:border-bronze-300"
            )}
          >
            {c} ({services?.filter((s) => s.category === c).length ?? 0})
          </button>
        ))}
      </div>

      {/* TanStack 表格 */}
      {services === null ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-xs">
          <Skeleton className="h-9 w-64" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filteredServices}
          searchPlaceholder="输入服务名称即时检索..."
          emptyText="当前品类下暂无调理项目"
          renderMobileCard={(s) => (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-serif font-medium text-bark-800">{s.name}</p>
                  <p className="line-clamp-2 text-[11px] text-bark-400">
                    {s.description ?? "暂无详述"}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide",
                    s.is_active
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-stone-300 bg-stone-100 text-stone-500"
                  )}
                >
                  {s.is_active ? "已上架供选" : "已下架隐藏"}
                </span>
              </div>

              <div className="flex items-end justify-between gap-3 border-t border-border/60 pt-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-bark-600">
                  <span className="rounded-md bg-secondary/80 px-2 py-0.5">
                    {s.category ?? "常规调养"}
                  </span>
                  <span className="font-mono text-bark-500">
                    {formatDuration(s.duration)}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-serif text-base font-semibold leading-tight text-bronze-700">
                    {formatCNY(s.price)}
                  </p>
                  {s.member_price != null && (
                    <p className="text-[10px] text-bark-400">
                      会籍 {formatCNY(s.member_price)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 basis-[calc(50%-0.375rem)] text-xs text-bark-700"
                  onClick={() => openEdit(s)}
                >
                  <Edit className="mr-1 size-3 text-bark-400" /> 编辑
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 basis-[calc(50%-0.375rem)] text-xs text-bronze-700"
                  onClick={() => openConfig(s)}
                >
                  <UsersRound className="mr-1 size-3 text-bronze-600" /> 分配技师
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 basis-full text-xs text-rose-700"
                  onClick={() => void remove(s)}
                >
                  <Trash2 className="mr-1 size-3" /> 删除项目
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {/* 新增/编辑项目弹窗 */}
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
              {editing ? "编辑调理服务" : "新增调理服务"}
            </DialogTitle>
            <DialogDescription>
              {editing ? editing.name : "添加新的养生调理项目至服务库"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">
                服务名称<span className="ml-0.5 text-rose-600">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-9 text-xs"
                placeholder="例如：姜汤头疗"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">所属品类</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="如：头疗养生"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">服务时长（分钟）</Label>
                <Input
                  type="number"
                  min={15}
                  step={15}
                  value={form.duration}
                  onChange={(e) =>
                    setForm({ ...form, duration: Number(e.target.value) })
                  }
                  className="h-9 text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  门市标价（元）<span className="ml-0.5 text-rose-600">*</span>
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
                <Label className="text-xs">会员专享价（元）</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.memberPrice}
                  onChange={(e) => setForm({ ...form, memberPrice: e.target.value })}
                  placeholder="留空即无专享价"
                  className="h-9 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">排序权重（越小越靠前）</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) =>
                  setForm({ ...form, sort_order: Number(e.target.value) })
                }
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">调理功效与项目介绍</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="text-xs"
                placeholder="介绍调理手法、草本特色及针对的亚健康状态"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2">
              <span className="text-xs text-bark-600">上架供顾客预约</span>
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
              {submitting ? "保存中…" : "确认保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 技师配置弹窗 */}
      <Dialog
        open={Boolean(configTarget)}
        onOpenChange={(o) => !o && setConfigTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">
              「{configTarget?.name}」执操技师指派
            </DialogTitle>
            <DialogDescription>
              勾选授权的技师在顾客预约此项目时可被选定接单
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {staffList.length === 0 && (
              <p className="py-6 text-center text-xs text-bark-400">
                暂无在职技师，请先于员工管理中录入工匠
              </p>
            )}
            {staffList.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-xs transition-colors hover:bg-secondary/60"
              >
                <Checkbox
                  checked={configChecked.has(s.id)}
                  onCheckedChange={(v) => void toggleConfig(s.id, Boolean(v))}
                />
                <span className="font-serif font-medium text-bark-800">
                  {s.name}
                  {s.title ? ` · ${s.title}` : ""}
                </span>
                {!s.is_active && (
                  <span className="ml-auto text-[10px] text-stone-400">已停工</span>
                )}
              </label>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
