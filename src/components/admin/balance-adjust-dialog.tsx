"use client";

import { useEffect, useState } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { mutate } from "@/lib/supabase/query";
import { formatCNY } from "@/lib/format";
import type { Members } from "@/lib/types";
import { cn } from "@/lib/utils";

const REASONS = ["充值入账", "消费核销", "活动赠送", "退款", "老板手动调整"];

export interface BalanceAdjustDialogProps {
  member: Members | null;
  onOpenChange: (open: boolean) => void;
  /**
   * 调整成功后的回调，且**在数据刷新完成之后**才被调用 ——
   * 余额调整是「改了钱就要看见新数字」的操作，先关窗再异步取数会让用户
   * （和自动化测试）读到上一轮的旧余额。
   */
  onAdjusted: () => Promise<void> | void;
}

/**
 * 手动调整会员余额。
 *
 * 从 members 页面抽出：这段含两套输入模式（设为指定金额 / 增减差额）、
 * 金额校验、生效后余额预览与事由选择，约 100 行 JSX 加 40 行提交逻辑，
 * 与页面的表格/其他弹窗无耦合。
 *
 * 组件内部自己管「模式、金额、事由」三个表单态：页面只需要知道
 * 「给哪个会员调」和「调完了」。
 */
export function BalanceAdjustDialog({
  member,
  onOpenChange,
  onAdjusted,
}: BalanceAdjustDialogProps) {
  const [mode, setMode] = useState<"set" | "delta">("set");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [submitting, setSubmitting] = useState(false);

  // 每次针对新会员打开时重置表单，避免沿用上一次的金额与事由。
  // 这是一次性的"随目标切换而复位"，同步置位是必要的（延后一帧会让用户
  // 看到上一个会员的余额在输入框里）。服务端不会渲染表单内容（弹窗关闭态），
  // 因此不存在水合问题。
  useEffect(() => {
    if (!member) return;
    /* eslint-disable react-hooks/set-state-in-effect -- 切换目标会员即重置表单，需同步复位避免残留上一个会员的余额 */
    setMode("set");
    setAmount(String(member.balance));
    setReason(REASONS[0]);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [member]);

  const submit = async () => {
    if (!member) return;
    const value = Number(amount);
    // Number("Infinity")/Number("1e309") 都不是 NaN，能骗过 isNaN 检查并让预览
    // 渲染成 ¥Infinity。用 isFinite 收口，并加上合理上界（余额是钱，不允许六位以上乱填）。
    if (!Number.isFinite(value) || value === 0) {
      toast.error("请输入有效的金额");
      return;
    }
    if (Math.abs(value) > 1_000_000) {
      toast.error("单次调整金额不能超过 ¥1,000,000");
      return;
    }
    const final = mode === "set" ? value : Number(member.balance) + value;
    if (!Number.isFinite(final) || final < 0) {
      toast.error("调整后余额不能为负数");
      return;
    }

    setSubmitting(true);
    const { error } = await mutate(() =>
      createClient().rpc("admin_update_balance", {
        p_member_id: member.id,
        p_new_balance: final,
        p_reason: reason,
      })
    );
    setSubmitting(false);
    if (error) {
      toast.error("调整失败", { description: error.message });
      return;
    }
    await onAdjusted();
    toast.success("余额已更新，变动已记录");
    onOpenChange(false);
  };

  const preview = Number.isNaN(Number(amount))
    ? 0
    : mode === "set"
    ? Number(amount)
    : Number(member?.balance ?? 0) + Number(amount);

  return (
    <Dialog open={Boolean(member)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">手动调整会员余额</DialogTitle>
          <DialogDescription>
            {member?.name} 当前账户结余 {formatCNY(member?.balance ?? 0)}
            ，本次调整将永久记入审计流水。
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
                  setMode(m.key);
                  setAmount(m.key === "set" ? String(member?.balance ?? 0) : "");
                }}
                className={cn(
                  "rounded-md border px-3 py-2 text-xs transition-colors",
                  mode === m.key
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
              {mode === "set" ? "调整后新余额（元）" : "变动金额（正数充值，负数核销）"}
            </Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-9 text-xs"
            />
            <p className="text-[11px] text-bark-400">
              生效后结余：{" "}
              <strong className="text-bronze-700">{formatCNY(preview)}</strong>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">变更款项事由</Label>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    reason === r
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
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={submit}
            size="sm"
            disabled={submitting || amount === ""}
            className="bg-bronze-500 text-white hover:bg-bronze-600"
          >
            {submitting ? "提交中…" : "确认入账"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
