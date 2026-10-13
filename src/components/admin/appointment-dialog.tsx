"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import { broadcastAppointmentsChanged } from "@/lib/hooks";
import { formatCNY, formatDateTime, formatDuration, formatTime, bookedPrice } from "@/lib/format";
import type { AppointmentWithRefs } from "@/lib/types";

interface AppointmentDialogProps {
  appointment: AppointmentWithRefs | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

/** 预约详情与状态流转（老板操作） */
export function AppointmentDialog({
  appointment,
  onOpenChange,
  onChanged,
}: AppointmentDialogProps) {
  const [busy, setBusy] = useState(false);

  if (!appointment) return null;

  const setStatus = async (status: string, label: string) => {
    setBusy(true);
    const { error } = await createClient().rpc("update_appointment_status", {
      p_appointment_id: appointment.id,
      p_status: status,
    });
    setBusy(false);
    if (error) {
      // 不用乐观更新：状态机可能拒绝（如终态保护），必须等服务端裁决后再提示
      toast.error("操作失败", { description: error.message });
      return;
    }
    toast.success(`已标记为「${label}」`);
    broadcastAppointmentsChanged();
    onChanged();
    onOpenChange(false);
  };

  const cancel = async () => {
    setBusy(true);
    const { error } = await createClient().rpc("cancel_appointment", {
      p_appointment_id: appointment.id,
    });
    setBusy(false);
    if (error) {
      toast.error("取消失败", { description: error.message });
      return;
    }
    // 取消会立刻退款/退券且不可逆（cancelled 是终态，状态机不允许恢复），
    // 因此不做乐观更新、也不提供「撤销」——只如实告知已完成的操作。
    toast.success("预约已取消，款项已退回", {
      description: "该操作不可撤销，如需重新预约请再建一单",
    });
    broadcastAppointmentsChanged();
    onChanged();
    onOpenChange(false);
  };

  const { status } = appointment;
  const flowActions: { label: string; status: string }[] =
    status === "pending"
      ? [{ label: "确认接单", status: "confirmed" }]
      : status === "confirmed"
        ? [
            { label: "顾客到店", status: "arrived" },
            { label: "完成服务", status: "done" },
            { label: "顾客未到", status: "no_show" },
          ]
        : status === "arrived"
          ? [
              { label: "完成服务", status: "done" },
              { label: "顾客未到", status: "no_show" },
            ]
          : [];

  const canCancel = ["pending", "confirmed"].includes(status);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif">
            {appointment.services?.name ?? "预约详情"}
            <StatusBadge status={status} />
          </DialogTitle>
          <DialogDescription>预约编号 {appointment.id.slice(0, 8)}</DialogDescription>
        </DialogHeader>

        <dl className="space-y-2.5 rounded-md bg-secondary/60 p-4 text-sm">
          <Row label="会员" value={appointment.members?.name ?? "—"} />
          <Row label="技师" value={appointment.staff?.name ?? "—"} />
          <Row
            label="时间"
            value={`${formatDateTime(appointment.start_time)} – ${formatTime(appointment.end_time)}`}
          />
          <Row
            label="时长 / 价格"
            value={`${formatDuration(appointment.services?.duration ?? 0)} · ${formatCNY(bookedPrice(appointment))}`}
          />
          {appointment.remark && <Row label="备注" value={appointment.remark} />}
        </dl>

        {(flowActions.length > 0 || canCancel) && (
          <>
            <Separator />
            <div className="flex flex-wrap gap-2">
              {flowActions.map((action) => (
                <Button
                  key={action.status}
                  size="sm"
                  disabled={busy}
                  onClick={() => setStatus(action.status, action.label)}
                  className={
                    action.status === "confirmed" || action.status === "done"
                      ? "bg-bronze-500 text-white hover:bg-bronze-600"
                      : ""
                  }
                >
                  {action.label}
                </Button>
              ))}
              {canCancel && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={cancel}
                  className="border-rose-200 text-rose-700 hover:bg-rose-50"
                >
                  取消预约
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-bark-400">{label}</dt>
      <dd className="text-right text-bark-700">{value}</dd>
    </div>
  );
}
