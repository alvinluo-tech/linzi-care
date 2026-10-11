"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
import { AccountActions } from "@/components/admin/account-actions";
import { CredentialsDialog } from "@/components/credentials-dialog";
import { invokeFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/client";
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
    const supabase = createClient();
    const [staffRes, profilesRes] = await Promise.all([
      supabase.from("staff").select("*").order("sort_order"),
      supabase.from("profiles").select("id, phone, email"),
    ]);
    const profiles = (profilesRes.data as Pick<Profiles, "id" | "phone" | "email">[]) ?? [];
    setRows(
      ((staffRes.data as Staff[]) ?? []).map((s) => ({
        ...s,
        profile: profiles.find((p) => p.id === s.user_id) ?? null,
      }))
    );
  }, []);

  useEffect(() => {
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
      setCredentials(data);
      setCreateOpen(false);
      setForm({ name: "", email: "", phone: "", title: "", bio: "" });
      toast.success("员工账号已创建");
      void load();
    } catch (e) {
      toast.error("创建失败", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSubmitting(true);
    const { error } = await createClient()
      .from("staff")
      .update({
        name: editing.name,
        title: editing.title,
        bio: editing.bio,
        sort_order: editing.sort_order,
        is_active: editing.is_active,
      })
      .eq("id", editing.id);
    setSubmitting(false);
    if (error) {
      toast.error("保存失败", { description: error.message });
      return;
    }
    toast.success("已保存");
    setEditing(null);
    void load();
  };

  const toggleBusiness = async (row: StaffRow, active: boolean) => {
    const { error } = await createClient()
      .from("staff")
      .update({ is_active: active })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-bark-800">员工管理</h1>
          <p className="mt-1 text-sm text-bark-400">
            创建员工账号后，凭证仅展示一次，请线下告知员工
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-bronze-500 text-white hover:bg-bronze-600"
        >
          <Plus /> 创建员工账号
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名 / 职位</TableHead>
              <TableHead>联系方式</TableHead>
              <TableHead className="w-20">状态</TableHead>
              <TableHead className="w-16">排序</TableHead>
              <TableHead className="min-w-72">账号操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === null ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-sm text-bark-400">
                  还没有员工，点击右上角创建
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium text-bark-800">{row.name}</p>
                    <p className="text-xs text-bark-400">{row.title ?? "—"}</p>
                  </TableCell>
                  <TableCell className="text-sm text-bark-600">
                    <p>{row.profile?.email ?? row.profile?.phone ?? "—"}</p>
                    <p className="text-xs text-bark-400">
                      {row.profile?.phone ?? ""}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded-sm border px-2 py-0.5 text-xs ${
                        row.is_active
                          ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                          : "border-stone-300 bg-stone-200 text-stone-600"
                      }`}
                    >
                      {row.is_active ? "在岗" : "停用"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-bark-500">
                    {row.sort_order}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(row)}
                      >
                        编辑资料
                      </Button>
                      <AccountActions
                        userId={row.user_id}
                        email={row.profile?.email ?? null}
                        active={row.is_active}
                        name={row.name}
                        onToggleBusiness={(active) => toggleBusiness(row, active)}
                        onChanged={() => void load()}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 创建员工 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">创建员工账号</DialogTitle>
            <DialogDescription>
              系统自动生成初始密码，创建成功后弹窗展示一次。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="姓名" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="员工真实姓名"
              />
            </Field>
            <Field label="登录邮箱" required>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="用于登录，如 staff@example.com"
              />
            </Field>
            <Field label="手机号">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="职位头衔">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="如：高级技师"
              />
            </Field>
            <Field label="简介（展示在预约页）">
              <Textarea
                rows={2}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              onClick={createStaff}
              disabled={submitting || !form.name.trim() || !form.email.trim()}
              className="bg-bronze-500 text-white hover:bg-bronze-600"
            >
              {submitting ? "创建中…" : "创建账号"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑员工资料 */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">编辑员工资料</DialogTitle>
            <DialogDescription>
              登录邮箱不可修改；如需更换请删除后重建账号。
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <Field label="姓名" required>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </Field>
              <Field label="职位头衔">
                <Input
                  value={editing.title ?? ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </Field>
              <Field label="简介">
                <Textarea
                  rows={2}
                  value={editing.bio ?? ""}
                  onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
                />
              </Field>
              <Field label="排序（越小越靠前）">
                <Input
                  type="number"
                  value={editing.sort_order}
                  onChange={(e) =>
                    setEditing({ ...editing, sort_order: Number(e.target.value) })
                  }
                />
              </Field>
              <div className="flex items-center justify-between rounded-md bg-secondary/60 px-3 py-2">
                <span className="text-sm text-bark-600">在岗（可被顾客预约）</span>
                <Switch
                  checked={editing.is_active}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button
              onClick={saveEdit}
              disabled={submitting}
              className="bg-bark-700 text-ivory hover:bg-bark-600"
            >
              {submitting ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      <Label>
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </Label>
      {children}
    </div>
  );
}
