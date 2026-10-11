"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Plus, Wallet } from "lucide-react";
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
import { AccountActions } from "@/components/admin/account-actions";
import { CredentialsDialog } from "@/components/credentials-dialog";
import { invokeFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/client";
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
    const { data } = await createClient()
      .from("members")
      .select("*")
      .order("created_at", { ascending: false });
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
    const { error } = await createClient().rpc("admin_update_balance", {
      p_member_id: balanceTarget.id,
      p_new_balance: final,
      p_reason: balanceReason,
    });
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
    const { data } = await createClient()
      .from("balance_logs")
      .select("*")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setLogs((data as BalanceLogs[]) ?? []);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSubmitting(true);
    const { error } = await createClient()
      .from("members")
      .update({
        name: editing.name,
        phone: editing.phone,
        note: editing.note,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-bark-800">会员管理</h1>
          <p className="mt-1 text-sm text-bark-400">
            收付款走微信线下，余额由老板在此手动登记，全程留痕
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-bronze-500 text-white hover:bg-bronze-600"
        >
          <Plus /> 创建会员账号
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>会员</TableHead>
              <TableHead>联系方式</TableHead>
              <TableHead className="text-right">余额</TableHead>
              <TableHead className="w-20">状态</TableHead>
              <TableHead className="min-w-64">操作</TableHead>
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
                  还没有会员，点击右上角创建
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium text-bark-800">{row.name}</p>
                    <p className="text-xs text-bark-400">
                      {row.note ?? formatDateTime(row.created_at) + " 建档"}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-bark-600">
                    <p>{row.phone ?? "—"}</p>
                    <p className="text-xs text-bark-400">{row.email ?? ""}</p>
                  </TableCell>
                  <TableCell className="text-right font-serif text-lg text-bronze-700">
                    {formatCNY(row.balance)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded-sm border px-2 py-0.5 text-xs",
                        row.is_active
                          ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                          : "border-stone-300 bg-stone-200 text-stone-600"
                      )}
                    >
                      {row.is_active ? "正常" : "停用"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setBalanceTarget(row);
                          setBalanceMode("set");
                          setBalanceAmount(String(row.balance));
                        }}
                      >
                        <Wallet /> 调整余额
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void openLogs(row)}>
                        <History /> 变动记录
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(row)}>
                        编辑
                      </Button>
                      <AccountActions
                        userId={row.user_id}
                        email={row.email}
                        active={row.is_active}
                        name={row.name}
                        onToggleBusiness={async (active) => {
                          const { error } = await createClient()
                            .from("members")
                            .update({ is_active: active })
                            .eq("id", row.id);
                          if (error) throw new Error(error.message);
                        }}
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

      {/* 创建会员 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">创建会员账号</DialogTitle>
            <DialogDescription>
              系统自动生成初始密码，创建成功后弹窗展示一次。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                姓名<span className="ml-0.5 text-rose-600">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                登录邮箱<span className="ml-0.5 text-rose-600">*</span>
              </Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="用于登录与接收预约提醒"
              />
            </div>
            <div className="space-y-1.5">
              <Label>手机号</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>初始余额（元）</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.balance}
                onChange={(e) => setForm({ ...form, balance: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              onClick={createMember}
              disabled={submitting || !form.name.trim() || !form.email.trim()}
              className="bg-bronze-500 text-white hover:bg-bronze-600"
            >
              {submitting ? "创建中…" : "创建账号"}
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
            <DialogTitle className="font-serif">调整余额</DialogTitle>
            <DialogDescription>
              {balanceTarget?.name} 当前余额{" "}
              {formatCNY(balanceTarget?.balance ?? 0)}，变更将写入审计记录。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: "set", label: "设为指定余额" },
                  { key: "delta", label: "增减金额" },
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => {
                    setBalanceMode(m.key);
                    setBalanceAmount(
                      m.key === "set"
                        ? String(balanceTarget?.balance ?? 0)
                        : ""
                    );
                  }}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm transition-colors",
                    balanceMode === m.key
                      ? "border-bronze-500 bg-bronze-50 text-bronze-800"
                      : "border-border text-bark-600"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>{balanceMode === "set" ? "新余额（元）" : "增减金额（正增负减）"}</Label>
              <Input
                type="number"
                step="0.01"
                value={balanceAmount}
                onChange={(e) => setBalanceAmount(e.target.value)}
              />
              <p className="text-xs text-bark-400">
                调整后：{" "}
                {formatCNY(
                  Number.isNaN(Number(balanceAmount))
                    ? 0
                    : balanceMode === "set"
                      ? Number(balanceAmount)
                      : Number(balanceTarget?.balance ?? 0) + Number(balanceAmount)
                )}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>事由</Label>
              <div className="flex flex-wrap gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setBalanceReason(r)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
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
            <Button variant="outline" onClick={() => setBalanceTarget(null)}>
              取消
            </Button>
            <Button
              onClick={submitBalance}
              disabled={submitting || balanceAmount === ""}
              className="bg-bronze-500 text-white hover:bg-bronze-600"
            >
              {submitting ? "提交中…" : "确认调整"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 余额变动记录 */}
      <Dialog open={Boolean(logsTarget)} onOpenChange={(o) => !o && setLogsTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {logsTarget?.name} · 余额变动记录
            </DialogTitle>
            <DialogDescription>最近 30 条</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            {logs === null ? (
              <p className="py-6 text-center text-sm text-bark-400">加载中…</p>
            ) : logs.length === 0 ? (
              <p className="py-6 text-center text-sm text-bark-400">暂无变动记录</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between rounded-md bg-secondary/60 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="text-bark-700">{log.reason}</p>
                      <p className="text-xs text-bark-400">
                        {formatDateTime(log.created_at)} ·{" "}
                        {formatCNY(log.old_balance)} → {formatCNY(log.new_balance)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "font-medium",
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

      {/* 编辑会员 */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">编辑会员信息</DialogTitle>
            <DialogDescription>余额请通过「调整余额」操作，全程留痕。</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>姓名</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>手机号</Label>
                <Input
                  value={editing.phone ?? ""}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>备注</Label>
                <Input
                  value={editing.note ?? ""}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                  placeholder="偏好、注意事项等"
                />
              </div>
              <div className="flex items-center justify-between rounded-md bg-secondary/60 px-3 py-2">
                <span className="text-sm text-bark-600">正常状态</span>
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
