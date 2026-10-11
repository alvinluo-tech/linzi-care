"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, UsersRound } from "lucide-react";
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

  const load = useCallback(async () => {
    const supabase = createClient();
    const [servicesRes, staffRes, linksRes] = await Promise.all([
      supabase.from("services").select("*").order("sort_order"),
      supabase.from("staff").select("*").order("sort_order"),
      supabase.from("staff_services").select("*"),
    ]);
    setServices((servicesRes.data as Services[]) ?? []);
    setStaffList((staffRes.data as Staff[]) ?? []);
    setLinks((linksRes.data as StaffServices[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      ? await supabase.from("services").update(payload).eq("id", editing.id)
      : await supabase.from("services").insert(payload);
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
      const { error } = await supabase
        .from("staff_services")
        .insert({ staff_id: staffId, service_id: configTarget.id });
      if (error && !error.message.includes("duplicate")) {
        toast.error("保存失败", { description: error.message });
        return;
      }
    } else {
      const { error } = await supabase
        .from("staff_services")
        .delete()
        .eq("staff_id", staffId)
        .eq("service_id", configTarget.id);
      if (error) {
        toast.error("保存失败", { description: error.message });
        return;
      }
    }
    void load();
  };

  const remove = async (service: Services) => {
    const { error } = await createClient()
      .from("services")
      .delete()
      .eq("id", service.id);
    if (error) {
      toast.error("删除失败（可改为下架）", { description: error.message });
      return;
    }
    toast.success("已删除");
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-bark-800">服务项目管理</h1>
          <p className="mt-1 text-sm text-bark-400">
            维护项目目录、价格时长，并配置每位技师可接的项目
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-bronze-500 text-white hover:bg-bronze-600"
        >
          <Plus /> 新增项目
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>项目</TableHead>
              <TableHead>分类</TableHead>
              <TableHead>时长</TableHead>
              <TableHead className="text-right">门市 / 会员价</TableHead>
              <TableHead className="w-20">状态</TableHead>
              <TableHead className="min-w-52">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services === null ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : services.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-bark-400">
                  暂无服务项目
                </TableCell>
              </TableRow>
            ) : (
              services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell>
                    <p className="font-medium text-bark-800">{service.name}</p>
                    <p className="line-clamp-1 max-w-64 text-xs text-bark-400">
                      {service.description ?? "—"}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-bark-500">
                    {service.category ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-bark-500">
                    {formatDuration(service.duration)}
                  </TableCell>
                  <TableCell className="text-right">
                    <p className="font-medium text-bronze-700">
                      {formatCNY(service.price)}
                    </p>
                    {service.member_price != null && (
                      <p className="text-xs text-bark-400">
                        会员 {formatCNY(service.member_price)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded-sm border px-2 py-0.5 text-xs",
                        service.is_active
                          ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                          : "border-stone-300 bg-stone-200 text-stone-600"
                      )}
                    >
                      {service.is_active ? "在售" : "已下架"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(service)}>
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openConfig(service)}>
                        <UsersRound /> 技师
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-700 hover:bg-rose-50"
                        onClick={() => void remove(service)}
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

      {/* 新增/编辑项目 */}
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
              {editing ? "编辑项目" : "新增项目"}
            </DialogTitle>
            <DialogDescription>
              {editing ? editing.name : "创建新的服务项目"} 
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                项目名称<span className="ml-0.5 text-rose-600">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>分类</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="如：推拿理疗"
                />
              </div>
              <div className="space-y-1.5">
                <Label>时长（分钟）</Label>
                <Input
                  type="number"
                  min={15}
                  step={15}
                  value={form.duration}
                  onChange={(e) =>
                    setForm({ ...form, duration: Number(e.target.value) })
                  }
                />
              </div>
            </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>
                    门市价（元）<span className="ml-0.5 text-rose-600">*</span>
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
                  <Label>会员价（元，选填）</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.memberPrice}
                    onChange={(e) =>
                      setForm({ ...form, memberPrice: e.target.value })
                    }
                    placeholder="留空则无会员价"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
              <Label>项目介绍</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-md bg-secondary/60 px-3 py-2">
              <span className="text-sm text-bark-600">上架（顾客可见可预约）</span>
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

      {/* 技师配置 */}
      <Dialog
        open={Boolean(configTarget)}
        onOpenChange={(o) => !o && setConfigTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">
              「{configTarget?.name}」可接技师
            </DialogTitle>
            <DialogDescription>
              勾选后顾客预约该项目时可选择对应技师
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {staffList.length === 0 && (
              <p className="py-6 text-center text-sm text-bark-400">
                请先在「员工管理」中添加员工
              </p>
            )}
            {staffList.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-accent"
              >
                <Checkbox
                  checked={configChecked.has(s.id)}
                  onCheckedChange={(v) => void toggleConfig(s.id, Boolean(v))}
                />
                <span className="text-sm text-bark-700">
                  {s.name}
                  {s.title ? ` · ${s.title}` : ""}
                </span>
                {!s.is_active && (
                  <span className="ml-auto text-xs text-bark-400">已停用</span>
                )}
              </label>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
