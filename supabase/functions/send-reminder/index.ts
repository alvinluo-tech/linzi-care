// Edge Function: send-reminder
// 由 pg_cron + pg_net 每小时调用（携带 service_role 密钥），
// 查询未来 2 小时内开始的已确认预约并发送邮件提醒（Resend）。
// notifications 表按 appointment 去重，避免重复发送。

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { json } from "../_shared/cors.ts";

interface ReminderAppointment {
  id: string;
  start_time: string;
  members: { email: string | null; name: string | null } | null;
  staff: { name: string | null } | null;
  services: { name: string | null } | null;
}

const TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function reminderHtml(params: {
  memberName: string;
  serviceName: string;
  staffName: string;
  timeText: string;
}): string {
  const { memberName, serviceName, staffName, timeText } = params;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<body style="margin:0;padding:0;background-color:#f5f0e8;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:'PingFang SC','Microsoft YaHei',sans-serif;color:#3d2b1f;">
    <div style="border:1px solid #b8860b;border-radius:6px;background-color:#faf7f1;padding:32px;">
      <p style="margin:0 0 6px;font-size:13px;letter-spacing:4px;color:#b8860b;">LINZI WELLNESS</p>
      <h1 style="margin:0 0 24px;font-size:20px;font-weight:600;">林梓精养馆 · 预约提醒</h1>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.8;">
        ${escapeHtml(memberName)}，您好。您预约的
        <strong style="color:#b8860b;">${escapeHtml(serviceName)}</strong>
        将于 <strong>${escapeHtml(timeText)}</strong> 开始，
        技师：${escapeHtml(staffName)}，请提前 10 分钟到店。
      </p>
      <p style="margin:0 0 24px;font-size:13px;line-height:1.8;color:#8a7767;">
        如需改期或取消，请提前致电门店。期待您的光临。
      </p>
      <div style="border-top:1px solid #e4d9c6;padding-top:16px;font-size:12px;color:#8a7767;">
        林梓精养馆 · 梓养云 · 本邮件由系统自动发送，请勿回复
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader !== `Bearer ${serviceKey}`) {
      return json({ error: "Unauthorized" }, 401);
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return json({ error: "RESEND_API_KEY 未配置" }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("id, start_time, members(email, name), staff(name), services(name)")
      .eq("status", "confirmed")
      .gte("start_time", now.toISOString())
      .lte("start_time", twoHoursLater.toISOString())
      .order("start_time");

    if (error) return json({ error: error.message }, 500);

    const from = Deno.env.get("RESEND_FROM") ?? "林梓精养馆 <onboarding@resend.dev>";
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const apt of (appointments ?? []) as ReminderAppointment[]) {
      // 去重：已有成功发送记录的预约直接跳过
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("appointment_id", apt.id)
        .eq("type", "reminder")
        .eq("channel", "email")
        .eq("status", "sent")
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      const email = apt.members?.email;
      if (!email) {
        failed++;
        await supabase.from("notifications").insert({
          appointment_id: apt.id,
          type: "reminder",
          channel: "email",
          status: "failed",
        });
        continue;
      }

      const html = reminderHtml({
        memberName: apt.members?.name ?? "亲爱的会员",
        serviceName: apt.services?.name ?? "理疗项目",
        staffName: apt.staff?.name ?? "专属技师",
        timeText: TIME_FORMATTER.format(new Date(apt.start_time)),
      });

      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: `预约提醒：${apt.services?.name ?? "理疗项目"} · 林梓精养馆`,
          html,
        }),
      });

      const ok = resp.ok;
      if (!ok) {
        console.error(`Resend 发送失败 (${apt.id}): ${await resp.text()}`);
      }

      await supabase.from("notifications").insert({
        appointment_id: apt.id,
        type: "reminder",
        channel: "email",
        status: ok ? "sent" : "failed",
        sent_at: ok ? new Date().toISOString() : null,
      });

      if (ok) sent++;
      else failed++;
    }

    return json({ ok: true, total: appointments?.length ?? 0, sent, skipped, failed });
  } catch (e) {
    console.error("send-reminder fatal:", e);
    return json({ error: "提醒服务处理失败，请稍后重试" }, 500);
  }
});
