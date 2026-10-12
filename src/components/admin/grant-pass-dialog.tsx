"use client";

import { useEffect, useState } from "react";
import { Loader2, Ticket } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { mutate, q } from "@/lib/supabase/query";
import { formatCNY } from "@/lib/format";
import type { Members, Services } from "@/lib/types";

/**
 * 发放会籍权益（项目券）。
 *
 * 券绑定具体项目且一张只核销一次，所以「赠送 N 个项目」在这里就是发 N 张券；
 * 有效期默认 12 个月，与官网「充值赠送特色项目（有效期 1 年）」的口径一致。
 * 已下架项目故意不过滤——老板需要能给下架项目补发此前承诺的券，
 * 真正的拦截在核销侧由 RPC 负责。
 */
export function GrantPassDialog({
  member,
  open,
  onOpenChange,
}: {
  member: Members | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [services, setServices] = useState<Services[]>([]);
  const [loading, setLoading] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [months, setMonths] = useState("12");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    q(() =>
      createClient().from("services").select("*").order("sort_order")
    )
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error("项目列表加载失败", { description: error.message });
          setServices([]);
        } else {
          setServices((data as Services[]) ?? []);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        toast.error("项目列表加载失败", {
          description: e instanceof Error ? e.message : "网络异常",
        });
        setServices([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const chosen = services.find((s) => s.id === serviceId) ?? null;

  const submit = async () => {
    if (!member) return;
    if (!serviceId) {
      toast.error("请选择要发放的项目");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 24) {
      toast.error("发放张数需为 1 到 24 的整数");
      return;
    }
    const monthValue = months.trim() === "" ? 12 : Number(months);
    if (!Number.isInteger(monthValue) || monthValue < 0 || monthValue > 120) {
      toast.error("有效期月数需为 0 到 120 的整数（0 表示长期有效）");
      return;
    }

    setSubmitting(true);
    const { data, error } = await mutate(() =>
      createClient().rpc("grant_service_pass", {
        p_member_id: member.id,
        p_service_id: serviceId,
        p_quantity: qty,
        p_source: "gift",
        p_months: monthValue,
        p_remark: remark.trim() || undefined,
      })
    );
    setSubmitting(false);

    if (error) {
      toast.error("发放失败", { description: error.message });
      return;
    }
    toast.success(`已向 ${member.name} 发放 ${data ?? qty} 张「${chosen?.name ?? "项目"}」权益`);
    setServiceId("");
    setQuantity("1");
    setRemark("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">发放会籍权益</DialogTitle>
          <DialogDescription>
            {member ? `${member.name} · 现有余额 ${formatCNY(member.balance)}` : ""}
            。权益绑定单个项目、一张只可核销一次，取消或爽约时会自动退回。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="pass-service">指定项目</Label>
            <Select value={serviceId} onValueChange={setServiceId} disabled={loading}>
              <SelectTrigger id="pass-service">
                <SelectValue placeholder={loading ? "正在加载项目…" : "选择赠送的项目"} />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.is_active ? "" : "（已下架）"}
                    {" · "}
                    {formatCNY(s.member_price ?? s.price)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pass-qty">张数</Label>
              <Input
                id="pass-qty"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pass-months">有效期（月）</Label>
              <Input
                id="pass-months"
                inputMode="numeric"
                value={months}
                onChange={(e) => setMonths(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pass-remark">备注（可选）</Label>
            <Input
              id="pass-remark"
              value={remark}
              placeholder="如：充值 1000 赠送"
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={submit} disabled={submitting || loading}>
            {submitting ? <Loader2 className="animate-spin" /> : <Ticket />}
            确认发放
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
