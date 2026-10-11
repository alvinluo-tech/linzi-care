"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, History, Plus, UserPlus, Wallet } from "lucide-react";
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
import { DataTable } from "@/components/ui/data-table";
import { AccountActions } from "@/components/admin/account-actions";
import { CredentialsDialog } from "@/components/credentials-dialog";
import { invokeFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/client";
import { q } from "@/lib/supabase/query";
import { formatCNY, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BalanceLogs, Members } from "@/lib/types";

const REASONS = ["充值入账", "消费核销", "活动赠送", "退款", "老板手动调整"];

interface CreateResult {
  email: string;
  password: string;
}

export default function AdminMembersPage() {
  const [rows, setRows] = useState<Members[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Members | null>(null);
  const [credentials, setCredentials] = useState<CreateResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 余额调整
  const [balanceTarget, setBalanceTarget] = useState<Members | null>(null);
  const [balanceMode, setBalanceMode] = useState<"set" | "delta">("set");
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceReason, setBalanceReason] = useState(REASONS[0]);

  // 余额记录
  const [logsTarget, setLogsTarget] = useState<Members | null>(null);
  const [logs, setLogs] = useState<BalanceLogs[] | null>(null);

  // 创建表单
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    balance: "",
  });

  const load = useCallback(async () => {
    const { data } = await q(() =>
      createClient()
        .from("members")
        .select("*")
        .order("created_at", { ascending: false })
    );
    setRows((data as Members[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createMember = async () => {
    setSubmitting(true);
    try {
      const data = await invokeFunction<CreateResult>("create-user", {
        role: "customer",
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        initial_balance: form.balance ? Number(form.balance) : 0,
      });
      setCredentials(data);
      setCreateOpen(false);
      setForm({ name: "", email: "", phone: "", balance: "" });
      toast.success("会员账号已创建");
      void load();
    } catch (e) {
      toast.error("创建失败", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const submitBalance = async () => {
    if (!balanceTarget) return;
    const amount = Number(balanceAmount);
    if (Number.isNaN(amount)) {
      toast.error("请输入有效的金额");
      return;
    }
    const final =
      balanceMode === "set" ? amount : Number(balanceTarget.balance) + amount;
    if (final < 0) {
      toast.error("调整后余额不能为负数");
      return;
    }
    setSubmitting(true);
    const { error } = await q(() =>
      createClient().rpc("admin_update_balance", {
        p_member_id: balanceTarget.id,
        p_new_balance: final,
        p_reason: balanceReason,
      })
    );
    setSubmitting(false);
    if (error) {
      toast.error("调整失败", { description: error.message });
      return;
    }
    toast.success("余额已更新，变动已记录");
    setBalanceTarget(null);
    setBalanceAmount("");
    void load();
  };

  const openLogs = async (member: Members) => {
    setLogsTarget(member);
    setLogs(null);
    const { data } = await q(() =>
      createClient()
        .from("balance_logs")
        .select("*")
        .eq("member_id", member.id)
        .order("created_at", { ascending: false })
        .limit(30)
    );
    setLogs((data as BalanceLogs[]) ?? []);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSubmitting(true);
    const { error } = await q(() =>
      createClient()
        .from("members")
        .update({
          name: editing.name,
          phone: editing.phone,
          note: editing.note,
          is_active: editing.is_active,
        })
        .eq("id", editing.id)
    );
    setSubmitting(false);
    if (error) {
      toast.error("保存失败", { description: error.message });
      return;
    }
    toast.success("已保存");
    setEditing(null);
    void load();
  };

  // TanStack Table 列配置
  const columns = useMemo<ColumnDef<Members>[]>(
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
                onClick={() => {
                  setBalanceTarget(m);
                  setBalanceMode("set");
                  setBalanceAmount(String(m.balance));
                }}
              >
                <Wallet className="mr-1 size-3 text-bronze-600" /> 调余额
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-bark-600 hover:bg-secondary"
                onClick={() => void openLogs(m)}
              >
                <History className="mr-1 size-3 text-bark-400" /> 变动流水
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-bark-600 hover:bg-secondary"
                onClick={() => setEditing(m)}
              >
                编辑
              </Button>
              <AccountActions
                userId={m.user_id}
                email={m.email}
                active={m.is_active}
                name={m.name}
                onToggleBusiness={async (active) => {
                  const { error } = await q(() =>
                    createClient()
                      .from("members")
                      .update({ is_active: active })
                      .eq("id", m.id)
                  );
                  if (error) throw new Error(error.message);
                }}
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
      {/* 头部导航 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <UserPlus className="size-5 text-bronze-600" />
            <h1 className="font-serif text-2xl text-bark-800">会员名籍与资产管理</h1>
          </div>
          <p className="mt-1 text-xs text-bark-400">
            线下收付款由掌柜在此权威登记 · 实时审计留痕 · 支持即时按姓名与电话检索
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="h-9 bg-bronze-500 text-xs text-white hover:bg-bronze-600"
        >
          <Plus className="mr-1 size-3.5" /> 录入新会员
        </Button>
      </div>

      {/* 数据表格视图 (TanStack Table) */}
      {rows === null ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-xs">
          <Skeleton className="h-9 w-64" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="输入姓名或手机号搜索会员..."
          emptyText="未检索到匹配的会员名籍"
        />
      )}

      {/* 录入会员弹窗 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">录入新会员账号</DialogTitle>
            <DialogDescription>
              系统将自动生成 16 位高强度安全初始凭证，仅此一次弹窗展示。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">
                姓名尊称<span className="ml-0.5 text-rose-600">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：张女士"
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                登录账号 / 邮箱<span className="ml-0.5 text-rose-600">*</span>
              </Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="例如：vip.zhang@linzi.com"
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">联系电话</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="11位手机号码"
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">初始开卡预存金额（元）</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.balance}
                onChange={(e) => setForm({ ...form, balance: e.target.value })}
                placeholder="0.00"
                className="h-9 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              onClick={createMember}
              size="sm"
              disabled={submitting || !form.name.trim() || !form.email.trim()}
              className="bg-bronze-500 text-white hover:bg-bronze-600"
            >
              {submitting ? "建卡中…" : "开立会籍"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 调整余额 */}
      <Dialog
        open={Boolean(balanceTarget)}
        onOpenChange={(o) => !o && setBalanceTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">手动调整会员余额</DialogTitle>
            <DialogDescription>
              {balanceTarget?.name} 当前账户结余{" "}
              {formatCNY(balanceTarget?.balance ?? 0)}，本次调整将永久记入审计流水。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: "set", label: "设为指定金额" },
                  { key: "delta", label: "增减变动差额" },
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => {
                    setBalanceMode(m.key);
                    setBalanceAmount(
                      m.key === "set" ? String(balanceTarget?.balance ?? 0) : ""
                    );
                  }}
                  className={cn(
                    "rounded-md border px-3 py-2 text-xs transition-colors",
                    balanceMode === m.key
                      ? "border-bronze-500 bg-bronze-50 font-medium text-bronze-800"
                      : "border-border text-bark-600"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {balanceMode === "set" ? "调整后新余额（元）" : "变动金额（正数充值，负数核销）"}
              </Label>
              <Input
                type="number"
                step="0.01"
                value={balanceAmount}
                onChange={(e) => setBalanceAmount(e.target.value)}
                className="h-9 text-xs"
              />
              <p className="text-[11px] text-bark-400">
                生效后结余：{" "}
                <strong className="text-bronze-700">
                  {formatCNY(
                    Number.isNaN(Number(balanceAmount))
                      ? 0
                      : balanceMode === "set"
                      ? Number(balanceAmount)
                      : Number(balanceTarget?.balance ?? 0) + Number(balanceAmount)
                  )}
                </strong>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">变更款项事由</Label>
              <div className="flex flex-wrap gap-1.5">
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setBalanceReason(r)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                      balanceReason === r
                        ? "border-bronze-500 bg-bronze-500 text-white"
                        : "border-border text-bark-500 hover:border-bronze-300"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBalanceTarget(null)}>
              取消
            </Button>
            <Button
              onClick={submitBalance}
              size="sm"
              disabled={submitting || balanceAmount === ""}
              className="bg-bronze-500 text-white hover:bg-bronze-600"
            >
              {submitting ? "提交中…" : "确认入账"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 余额变动记录 */}
      <Dialog open={Boolean(logsTarget)} onOpenChange={(o) => !o && setLogsTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {logsTarget?.name} · 账户资产变动流水
            </DialogTitle>
            <DialogDescription>按发生时间倒序呈现近期30笔记录</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto pr-1">
            {logs === null ? (
              <p className="py-6 text-center text-xs text-bark-400">流水加载中…</p>
            ) : logs.length === 0 ? (
              <p className="py-6 text-center text-xs text-bark-400">暂无任何余额变更记录</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between rounded-lg border border-border/70 bg-paper/70 p-3 text-xs"
                  >
                    <div>
                      <p className="font-medium text-bark-800">{log.reason}</p>
                      <p className="mt-0.5 text-[11px] text-bark-400">
                        {formatDateTime(log.created_at)} · 结余：
                        {formatCNY(log.old_balance)} → {formatCNY(log.new_balance)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "font-serif text-sm font-semibold",
                        log.delta >= 0 ? "text-emerald-700" : "text-rose-700"
                      )}
                    >
                      {log.delta >= 0 ? "+" : ""}
                      {formatCNY(log.delta)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑会员资料 */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">编辑会员基本信息</DialogTitle>
            <DialogDescription>会籍余额不可在此直接篡改，请走调余额流程。</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">姓名尊称</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">联系电话</Label>
                <Input
                  value={editing.phone ?? ""}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">会籍备注（体质、偏好习惯）</Label>
                <Input
                  value={editing.note ?? ""}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2">
                <span className="text-xs text-bark-600">正常会籍状态</span>
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
              {submitting ? "保存中…" : "更新会籍"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 凭证一次性弹窗 */}
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
