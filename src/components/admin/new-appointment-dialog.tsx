"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { addDays, dateKey, formatCNY, formatTime } from "@/lib/format";
import type { Members, Services, Staff, StaffServices } from "@/lib/types";

interface NewAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
  defaultDate?: Date;
}

/** 老板代客预约：选择会员 → 项目 → 技师 → 时段 */
export function NewAppointmentDialog({
  open,
  onOpenChange,
  onChanged,
  defaultDate,
}: NewAppointmentDialogProps) {
  const [members, setMembers] = useState<Members[]>([]);
  const [services, setServices] = useState<Services[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffServices, setStaffServices] = useState<StaffServices[]>([]);
  const [loading, setLoading] = useState(true);

  const [memberId, setMemberId] = useState<string>("");
  const [memberFilter, setMemberFilter] = useState("");
  const [serviceId, setServiceId] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");
  // 日期与边界在挂载后初始化（预渲染期不能调用 new Date()）
  const [date, setDate] = useState("");
  const [minDate, setMinDate] = useState("");
  const [maxDate, setMaxDate] = useState("");
  const [slot, setSlot] = useState<string>("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const supabase = createClient();
    Promise.all([
      supabase
        .from("members")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("services")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("staff").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("staff_services").select("*"),
    ]).then(([m, s, st, ss]) => {
      setMembers((m.data as Members[]) ?? []);
      setServices((s.data as Services[]) ?? []);
      setStaffList((st.data as Staff[]) ?? []);
      setStaffServices((ss.data as StaffServices[]) ?? []);
      setLoading(false);
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      setMemberId("");
      setMemberFilter("");
      setServiceId("");
      setStaffId("");
      setSlot("");
      setRemark("");
      const today = new Date();
      setDate(dateKey(defaultDate ?? today));
      setMinDate(dateKey(today));
      setMaxDate(dateKey(addDays(today, 60)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const eligibleStaff = useMemo(
    () =>
      staffList.filter((s) =>
        staffServices.some(
          (ss) => ss.staff_id === s.id && ss.service_id === serviceId
        )
      ),
    [staffList, staffServices, serviceId]
  );
  const filteredMembers = useMemo(() => {
    const kw = memberFilter.trim();
    if (!kw) return members;
    return members.filter(
      (m) => m.name.includes(kw) || (m.phone ?? "").includes(kw)
    );
  }, [members, memberFilter]);

  useEffect(() => {
    if (!serviceId || !staffId || !date || !open) return;
    setSlotsLoading(true);
    setSlot("");
    createClient()
      .rpc("get_available_slots", {
        p_staff_id: staffId,
        p_service_id: serviceId,
        p_date: date,
      })
      .then(({ data, error }) => {
        if (error) {
          toast.error("获取时段失败", { description: error.message });
          setSlots([]);
        } else {
          setSlots((data as { slot_start: string }[]).map((r) => r.slot_start));
        }
        setSlotsLoading(false);
      });
  }, [serviceId, staffId, date, open]);

  const submit = async () => {
    if (!memberId || !serviceId || !staffId || !slot) {
      toast.error("请补全预约信息");
      return;
    }
    setSubmitting(true);
    const { error } = await createClient().rpc("create_appointment", {
      p_customer_id: memberId,
      p_staff_id: staffId,
      p_service_id: serviceId,
      p_start_time: slot,
      p_remark: remark || undefined,
      p_status: "confirmed",
    });
    setSubmitting(false);
    if (error) {
      toast.error("创建预约失败", { description: error.message });
      return;
    }
    toast.success("预约已创建（已确认）");
    onChanged();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif">新建预约</DialogTitle>
          <DialogDescription>为会员创建已确认的预约</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>会员</Label>
              <Input
                placeholder="输入姓名或手机号筛选"
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
              />
              <Select
                value={memberId}
                onValueChange={setMemberId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择会员" />
                </SelectTrigger>
                <SelectContent>
                  {filteredMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                      {m.phone ? ` · ${m.phone}` : ""} · 余额{" "}
                      {formatCNY(m.balance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>服务项目</Label>
              <Select value={serviceId} onValueChange={(v) => { setServiceId(v); setStaffId(""); }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择项目" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {formatCNY(s.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>技师</Label>
              <Select
                value={staffId}
                onValueChange={setStaffId}
                disabled={!serviceId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={serviceId ? "选择技师" : "请先选择项目"} />
                </SelectTrigger>
                <SelectContent>
                  {eligibleStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.title ? ` · ${s.title}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apt-date">日期</Label>
              <Input
                id="apt-date"
                type="date"
                value={date}
                min={minDate}
                max={maxDate}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>时段</Label>
              {!serviceId || !staffId ? (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-bark-400">
                  选择项目与技师后自动加载可约时段
                </p>
              ) : slotsLoading ? (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-bark-400">
                  时段加载中…
                </p>
              ) : slots.length === 0 ? (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-bark-400">
                  当日暂无可约时段（检查技师排班）
                </p>
              ) : (
                <div className="grid max-h-36 grid-cols-4 gap-2 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-6">
                  {slots.map((iso) => (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setSlot(iso)}
                      className={`rounded border py-1.5 text-xs transition-colors ${
                        slot === iso
                          ? "border-bronze-500 bg-bronze-500 text-white"
                          : "border-border text-bark-600 hover:border-bronze-300"
                      }`}
                    >
                      {formatTime(iso)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="apt-remark">备注（选填）</Label>
              <Textarea
                id="apt-remark"
                rows={2}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || loading}
            className="bg-bronze-500 text-white hover:bg-bronze-600"
          >
            {submitting ? "创建中…" : "创建预约"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
