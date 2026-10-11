"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import { APPOINTMENTS_CHANGED_EVENT } from "@/lib/hooks";

interface NewAppointmentPayload {
  members: { name: string | null } | null;
  staff: { name: string | null } | null;
  services: { name: string | null } | null;
  start_time: string;
}

/** 管理端 Realtime 订阅：新预约实时提醒（弹窗 + 声音），并广播变更事件 */
export function RealtimeNotifier() {
  useEffect(() => {
    const supabase = createClient();

    const broadcast = () =>
      window.dispatchEvent(new CustomEvent(APPOINTMENTS_CHANGED_EVENT));

    const channel = supabase
      .channel("admin-appointments")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "appointments" },
        async (payload) => {
          const id = (payload.new as { id?: string }).id;
          let description = "请刷新页面查看详情";
          if (id) {
            const { data } = await supabase
              .from("appointments")
              .select("start_time, members(name), staff(name), services(name)")
              .eq("id", id)
              .maybeSingle();
            const row = data as NewAppointmentPayload | null;
            if (row) {
              description = `${row.members?.name ?? "会员"} 预约了 ${
                row.services?.name ?? "项目"
              } · ${formatDateTime(row.start_time)} · 技师 ${
                row.staff?.name ?? "—"
              }`;
            }
          }
          toast("🔔 收到新预约", { description, duration: 10000 });
          playChime();
          broadcast();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "appointments" },
        broadcast
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "appointments" },
        broadcast
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return null;
}

/** 两音提示音；受浏览器自动播放策略限制时静默失败 */
function playChime() {
  try {
    const ctx = new AudioContext();
    const notes = [880, 1174.66];
    notes.forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch {
    // ignore
  }
}
