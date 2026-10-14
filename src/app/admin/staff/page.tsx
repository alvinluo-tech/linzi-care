"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Edit, Plus, Users } from "lucide-react";
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
import { AccountActions } from "@/components/admin/account-actions";
import { CredentialsDialog } from "@/components/credentials-dialog";
import { invokeFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/client";
import { adminGet } from "@/lib/admin/client";
import { mutate } from "@/lib/supabase/query";
import { cn } from "@/lib/utils";
import type { Profiles, Staff } from "@/lib/types";

interface StaffRow extends Staff {
  profile: Pick<Profiles, "id" | "phone" | "email"> | null;
}

interface CreateResult {
  email: string;
  password: string;
}

export default function AdminStaffPage() {
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [credentials, setCredentials] = useState<CreateResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 创建表单
  const [form, setForm] = useState({ name: "", email: "", phone: "", title: "", bio: "" });

  const load = useCallback(async () => {
    const res = await adminGet<{
      staff: Staff[];
      profiles: Pick<Profiles, "id" | "phone" | "email">[];
      error?: string;
    }>("/staff");
    if (res.error) {
      toast.error("员工档案加载失败", { description: res.error.message });
      setRows([]);
      return;
    }
    const profiles = res.data?.profiles ?? [];
    setRows(
      (res.data?.staff ?? []).map((s) => ({
        ...s,
        profile: profiles.find((p) => p.id === s.user_id) ?? null,
      }))
    );
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 该规则不追踪 async 边界：下面调用的 load() 首个动作就是 await 网络请求，setState 发生在 await 之后，非同步级联渲染。
    void load();
  }, [load]);

  const createStaff = async () => {
    setSubmitting(true);
    try {
      const data = await invokeFunction<CreateResult>("create-user", {
        role: "staff",
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        title: form.title.trim() || null,
        bio: form.bio.trim() || null,
      });
      // 先卸载「录入」弹窗，再挂载「凭证」弹窗，避免两者共用 z-index:50
      // 的 portal 同时在场时互相穿透（详见 members/page.tsx 同处注释）。
      setCreateOpen(false);
      setForm({ name: "", email: "", phone: "", title: "", bio: "" });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      setCredentials(data);
      toast.success("员工工匠账号已开立");
      void load();
    } catch (e) {
      toast.error("开立失败", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSubmitting(true);
    const { error } = await mutate(() =>
      createClient()
        .from("staff")
        .update({
          name: editing.name,
          title: editing.title,
          bio: editing.bio,
          sort_order: editing.sort_order,
          is_active: editing.is_active,
        })
        .eq("id", editing.id)
    );
    setSubmitting(false);
    if (error) {
      toast.error("保存失败", { description: error.message });
      return;
    }
    toast.success("工匠资料已保存");
    setEditing(null);
    void load();
  };

  const toggleBusiness = async (row: StaffRow, active: boolean) => {
    const { error } = await mutate(() =>
      createClient()
        .from("staff")
        .update({ is_active: active })
        .eq("id", row.id)
    );
    if (error) throw new Error(error.message);
  };

  const columns = useMemo<ColumnDef<StaffRow>[]>(
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
            技师姓名 / 头衔
            <ArrowUpDown className="ml-1 size-3 text-bark-400" />
          </Button>
        ),
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bark-700 font-serif text-xs font-semibold text-ivory">
                {s.name.slice(0, 1)}
              </span>
              <div>
                <p className="font-serif font-medium text-bark-800">{s.name}</p>
                <p className="text-[11px] text-bronze-700">{s.title ?? "理疗师"}</p>
              </div>
            </div>
          );
        },
      },
      {
        id: "contact",
        header: "联系电话 / 登录账号",
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="text-xs">
              <p className="font-medium text-bark-700">
                {s.profile?.phone ?? s.profile?.email ?? "未留电话"}
              </p>
              <p className="font-mono text-[11px] text-bark-400">
                {s.profile?.email ?? ""}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: "sort_order",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 text-xs font-serif font-medium text-bark-800"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            排序权重
            <ArrowUpDown className="ml-1 size-3 text-bark-400" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-bark-500">
            {row.original.sort_order}
          </span>
        ),
      },
      {
        accessorKey: "is_active",
        header: "在职执操状态",
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
              {active ? "在岗接单" : "停工离休"}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">账号管理与手令</div>,
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-bark-700 hover:bg-secondary"
                onClick={() => setEditing(s)}
              >
                <Edit className="mr-1 size-3 text-bark-400" /> 编辑资料
              </Button>
              <AccountActions
                userId={s.user_id}
                email={s.profile?.email ?? null}
                active={s.is_active}
                name={s.name}
                onToggleBusiness={(active) => toggleBusiness(s, active)}
                onChanged={() => void load()}
              />
            </div>
          );
        },
      },
    ],
    [load]
  );

  return (
    <div className="space-y-6">
      {/* 头部控制 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Users className="size-5 text-bronze-600" />
            <h1 className="font-serif text-2xl text-bark-800">员工与技师工匠名册</h1>
          </div>
          <p className="mt-1 text-xs text-bark-400">
            录入员工工号并生成一次性凭证 · 随时重置登录密码或办理在岗停发操作
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="h-9 bg-bronze-500 text-xs text-white hover:bg-bronze-600"
        >
          <Plus className="mr-1 size-3.5" /> 录入新员工工号
        </Button>
      </div>

      {/* TanStack Table */}
      {rows === null ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-xs">
          <Skeleton className="h-9 w-64" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="输入技师姓名或电话即时搜索..."
          emptyText="暂无符合条件的工匠记录"
          renderMobileCard={(s) => (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bark-700 font-serif text-xs font-semibold text-ivory">
                    {s.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-serif font-medium text-bark-800">{s.name}</p>
                    <p className="text-[11px] text-bronze-700">{s.title ?? "理疗师"}</p>
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide",
                    s.is_active
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-stone-300 bg-stone-100 text-stone-500"
                  )}
                >
                  {s.is_active ? "在岗接单" : "停工离休"}
                </span>
              </div>

              <div className="flex items-end justify-between gap-3 border-t border-border/60 pt-3">
                <div className="min-w-0 text-xs">
                  <p className="font-medium text-bark-700">
                    {s.profile?.phone ?? s.profile?.email ?? "未留电话"}
                  </p>
                  <p className="truncate font-mono text-[11px] text-bark-400">
                    {s.profile?.email ?? ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] text-bark-400">排序权重</p>
                  <p className="font-mono text-sm text-bark-600">{s.sort_order}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 basis-[calc(50%-0.375rem)] text-xs text-bark-700"
                  onClick={() => setEditing(s)}
                >
                  <Edit className="mr-1 size-3 text-bark-400" /> 编辑资料
                </Button>
                <AccountActions
                  userId={s.user_id}
                  email={s.profile?.email ?? null}
                  active={s.is_active}
                  name={s.name}
                  onToggleBusiness={(active) => toggleBusiness(s, active)}
                  onChanged={() => void load()}
                />
              </div>
            </div>
          )}
        />
      )}

      {/* 创建员工弹窗 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">录入新员工账号</DialogTitle>
            <DialogDescription>
              系统将自动生成 16 位初始凭证，创建成功后仅此一次弹窗展示。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="姓名尊称" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：林小梓"
                className="h-9 text-xs"
              />
            </Field>
            <Field label="登录账号 / 邮箱" required>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="例如：staff.lin@linzi.com"
                className="h-9 text-xs"
              />
            </Field>
            <Field label="联系电话">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="11位手机号码"
                className="h-9 text-xs"
              />
            </Field>
            <Field label="职位头衔 / 职级">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="如：金牌调理师 / 高级理疗技师"
                className="h-9 text-xs"
              />
            </Field>
            <Field label="技艺师承与个人简介（展示于前台预约卡）">
              <Textarea
                rows={2}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="擅长项目手法、从艺资历等"
                className="text-xs"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              onClick={createStaff}
              size="sm"
              disabled={submitting || !form.name.trim() || !form.email.trim()}
              className="bg-bronze-500 text-white hover:bg-bronze-600"
            >
              {submitting ? "建号中…" : "开立账号"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑员工资料弹窗 */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">编辑员工名册资料</DialogTitle>
            <DialogDescription>
              登录邮箱账号为系统唯一身份主键，不可随意更改。
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <Field label="姓名尊称" required>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="h-9 text-xs"
                />
              </Field>
              <Field label="职位头衔">
                <Input
                  value={editing.title ?? ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="h-9 text-xs"
                />
              </Field>
              <Field label="技艺简介">
                <Textarea
                  rows={2}
                  value={editing.bio ?? ""}
                  onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
                  className="text-xs"
                />
              </Field>
              <Field label="排序权重（越小越靠前）">
                <Input
                  type="number"
                  value={editing.sort_order}
                  onChange={(e) =>
                    setEditing({ ...editing, sort_order: Number(e.target.value) })
                  }
                  className="h-9 text-xs"
                />
              </Field>
              <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2">
                <span className="text-xs text-bark-600">在岗执操（可被顾客预约选派）</span>
                <Switch
                  checked={editing.is_active}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button
              onClick={saveEdit}
              size="sm"
              disabled={submitting}
              className="bg-bark-700 text-ivory hover:bg-bark-600"
            >
              {submitting ? "保存中…" : "更新资料"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 一次性凭证弹窗 */}
      {credentials && (
        <CredentialsDialog
          open
          onOpenChange={(open) => !open && setCredentials(null)}
          email={credentials.email}
          password={credentials.password}
        />
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </Label>
      {children}
    </div>
  );
}
