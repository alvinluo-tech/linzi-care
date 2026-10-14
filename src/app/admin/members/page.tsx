"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History, Plus, Ticket, UserPlus, Wallet } from "lucide-react";
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
import { useMemberColumns } from "@/components/admin/member-columns";
import { BalanceAdjustDialog } from "@/components/admin/balance-adjust-dialog";
import { CredentialsDialog } from "@/components/credentials-dialog";
import { GrantPassDialog } from "@/components/admin/grant-pass-dialog";
import { invokeFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/client";
import { adminGet } from "@/lib/admin/client";
import { mutate } from "@/lib/supabase/query";
import { formatCNY, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BalanceLogs, Members } from "@/lib/types";

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

  // 余额记录
  const [logsTarget, setLogsTarget] = useState<Members | null>(null);
  const [passTarget, setPassTarget] = useState<Members | null>(null);
  const [logs, setLogs] = useState<BalanceLogs[] | null>(null);
  const logsReqRef = useRef(0);

  // 创建表单
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    balance: "",
  });

  const load = useCallback(async () => {
    const res = await adminGet<{ members: Members[]; error?: string }>("/members");
    if (res.error) {
      toast.error("会员名籍加载失败", { description: res.error.message });
      setRows([]);
      return;
    }
    setRows(res.data?.members ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 该规则不追踪 async 边界：下面调用的 load() 首个动作就是 await 网络请求，setState 发生在 await 之后，非同步级联渲染。
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
      // 先卸载「录入」弹窗，再挂载「凭证」弹窗。
      // 两个 Dialog 都通过 portal 挂到 body 且 z-index 同为 50，同时在场时
      // 关闭中的那个仍会绘制一帧，导致下层表单文字从凭证面板边缘透出（层叠重影）。
      // 用一帧间隔错开，保证任一时刻只有一个弹窗在 DOM 中。
      setCreateOpen(false);
      setForm({ name: "", email: "", phone: "", balance: "" });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      setCredentials(data);
      toast.success("会员账号已创建");
      void load();
    } catch (e) {
      toast.error("创建失败", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const openLogs = async (member: Members) => {
    const req = ++logsReqRef.current;
    setLogsTarget(member);
    setLogs(null);
    const res = await adminGet<{ logs: BalanceLogs[]; error?: string }>(
      "/balance-logs",
      { member_id: member.id, limit: "30" }
    );
    // 乱序守卫：连点两行时，先点击那一条的响应不得覆盖后打开的弹窗
    if (req !== logsReqRef.current) return;
    if (res.error) {
      toast.error("余额流水加载失败", { description: res.error.message });
      setLogs([]);
      return;
    }
    setLogs(res.data?.logs ?? []);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSubmitting(true);
    const { error } = await mutate(() =>
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
  const columns = useMemberColumns({
    onAdjustBalance: (m) => setBalanceTarget(m),
    onOpenLogs: (m) => void openLogs(m),
    onOpenPasses: (m) => setPassTarget(m),
    onEdit: (m) => setEditing(m),
    onChanged: () => void load(),
  });

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
          renderMobileCard={(m) => (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-serif font-medium text-bark-800">{m.name}</p>
                  <p className="text-[11px] text-bark-400">
                    {m.note ? m.note : formatDateTime(m.created_at) + " 入籍"}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide",
                    m.is_active
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-stone-300 bg-stone-100 text-stone-500"
                  )}
                >
                  {m.is_active ? "正籍有效" : "休眠停用"}
                </span>
              </div>

              <div className="flex items-end justify-between gap-3 border-t border-border/60 pt-3">
                <div className="min-w-0 text-xs">
                  <p className="font-medium text-bark-700">{m.phone ?? "未留手机"}</p>
                  <p className="truncate font-mono text-[11px] text-bark-400">{m.email ?? ""}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] text-bark-400">账户余额</p>
                  <p className="font-serif text-lg font-semibold leading-tight text-bronze-700">
                    {formatCNY(m.balance)}
                  </p>
                </div>
              </div>

              {/* 操作入口在窄屏下改为整行平铺，保证每一个手令都无需横向滚动即可触达 */}
              <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 basis-[calc(50%-0.375rem)] text-xs text-bronze-700"
                  onClick={() => setBalanceTarget(m)}
                >
                  <Wallet className="mr-1 size-3 text-bronze-600" /> 调余额
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 basis-[calc(50%-0.375rem)] text-xs text-bark-600"
                  onClick={() => void openLogs(m)}
                >
                  <History className="mr-1 size-3 text-bark-400" /> 变动流水
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 basis-[calc(50%-0.375rem)] text-xs text-bark-600"
                  onClick={() => setPassTarget(m)}
                >
                  <Ticket className="mr-1 size-3" /> 权益
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 basis-[calc(50%-0.375rem)] text-xs text-bark-600"
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
                    const { error } = await mutate(() =>
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
            </div>
          )}
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
      <BalanceAdjustDialog
        member={balanceTarget}
        onOpenChange={(o) => !o && setBalanceTarget(null)}
        onAdjusted={load}
      />

      {/* 余额变动记录 */}
      <GrantPassDialog
        member={passTarget}
        open={Boolean(passTarget)}
        onOpenChange={(o) => !o && setPassTarget(null)}
      />

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
