// Supabase Edge Function: send-push
// 职责：
// 1. 发送 PWA Web Push 系统通知（基于 web-push，携带 VAPID 签名）
// 2. 遇到 404/410 状态码时，自动清理失效订阅端点
// 3. 处理 Database Webhook 实时通知（新预约/改签时通知老板与技师）
// 4. 处理 pg_cron 定时提醒（查询 reminders 表到期记录，未订阅或推送失败时降级 Resend 邮件）
// 5. 全流程在 notifications 表记录去重与审计

import "@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { json, preflight } from "../_shared/cors.ts";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@linzi.com";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM") || "林梓精养馆 <onboarding@resend.dev>";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const supabase = getAdminClient();
    const body = await req.json().catch(() => ({}));
    const action = body.action || "process_reminders";

    // 模式 A：处理到期的预约提醒（pg_cron 每 5 分钟调用，或手动调用）
    if (action === "process_reminders") {
      return await handleProcessReminders(supabase);
    }

    // 模式 B：处理预约表的 Database Webhook 实时变动（INSERT / UPDATE 时通知老板与技师）
    if (action === "webhook_appointment" || body.type === "INSERT" || body.type === "UPDATE") {
      return await handleAppointmentWebhook(supabase, body);
    }

    // 模式 C：向指定用户直接发送测试/自定义通知
    if (action === "send_to_user") {
      const { user_id, title, body: msgBody, url } = body;
      if (!user_id) return json({ error: "Missing user_id" }, 400);
      const result = await pushToUser(supabase, user_id, {
        title: title || "林梓精养馆 · 通知",
        body: msgBody || "您有一条新消息",
        url: url || "/my",
      });
      return json({ ok: true, result });
    }

    return json({ error: "Unknown action", action }, 400);
  } catch (e) {
    console.error("send-push fatal:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

/** 处理到期提醒任务队列 */
async function handleProcessReminders(supabase: any) {
  const nowIso = new Date().toISOString();

  // 1. 查询 reminders 表中 send_at <= now() 且 status='pending' 的任务
  const { data: reminderQueue, error: queueErr } = await supabase
    .from("reminders")
    .select(`
      id,
      appointment_id,
      send_at,
      appointments (
        id,
        status,
        start_time,
        remark,
        members ( id, name, phone, email, user_id ),
        staff ( id, name, title, user_id ),
        services ( id, name, duration, price )
      )
    `)
    .eq("status", "pending")
    .lte("send_at", nowIso)
    .order("send_at")
    .limit(50);

  if (queueErr) {
    return json({ error: queueErr.message }, 500);
  }

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const item of reminderQueue || []) {
    const apt = item.appointments;
    if (!apt || apt.status === "cancelled" || apt.status === "no_show") {
      await supabase.from("reminders").update({ status: "cancelled" }).eq("id", item.id);
      skippedCount++;
      continue;
    }

    // 2. 检查 notifications 表，避免同一预约重复发送提醒
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("appointment_id", apt.id)
      .eq("type", "reminder")
      .eq("status", "sent")
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase.from("reminders").update({ status: "sent" }).eq("id", item.id);
      skippedCount++;
      continue;
    }

    const memberName = apt.members?.name || "贵宾";
    const serviceName = apt.services?.name || "理疗项目";
    const staffName = apt.staff?.name || "专属技师";
    const timeText = TIME_FORMATTER.format(new Date(apt.start_time));

    const notificationTitle = `预约提醒 · ${serviceName}`;
    const notificationBody = `尊贵的${memberName}，您预约的「${serviceName}」将于 ${timeText} 开始（技师：${staffName}），请提前10分钟到店。`;
    const targetUrl = "/my";

    let pushSuccess = false;
    const customerUserId = apt.members?.user_id;

    // 3. 尝试发送 PWA 系统推送
    if (customerUserId) {
      const pushRes = await pushToUser(supabase, customerUserId, {
        title: notificationTitle,
        body: notificationBody,
        url: targetUrl,
        tag: `reminder-${apt.id}`,
      });
      if (pushRes.success > 0) {
        pushSuccess = true;
      }
    }

    if (pushSuccess) {
      // PWA 推送成功，记录到 notifications 并更新 reminders
      await supabase.from("notifications").insert({
        appointment_id: apt.id,
        type: "reminder",
        channel: "pwa",
        status: "sent",
        sent_at: new Date().toISOString(),
      });
      await supabase.from("reminders").update({ status: "sent" }).eq("id", item.id);
      sentCount++;
    } else {
      // 4. 降级策略：未订阅或推送失败时，调用 Resend 邮件发送兜底提醒
      let emailSuccess = false;
      const email = apt.members?.email;

      if (email && RESEND_API_KEY) {
        try {
          const emailHtml = `
            <div style="font-family: sans-serif; background-color: #f5f0e8; padding: 24px;">
              <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #b8860b; border-radius: 8px; padding: 28px;">
                <h2 style="color: #3d2b1f; margin-top: 0;">林梓精养馆 · 预约提醒</h2>
                <p style="color: #4a382b; font-size: 15px; line-height: 1.6;">
                  尊敬的 <strong>${memberName}</strong>，您预约的 <strong>${serviceName}</strong> 将于 <strong>${timeText}</strong> 开始。
                </p>
                <p style="color: #7e6350; font-size: 14px;">技师：${staffName}</p>
                <p style="color: #7e6350; font-size: 13px;">门店地址：广州市增城区新塘镇国贸汇 林梓·头疗美容养生</p>
                <hr style="border: none; border-top: 1px solid #e7dcd2; margin: 20px 0;" />
                <p style="color: #a98f7b; font-size: 12px; margin: 0;">此邮件为预约提醒兜底服务，请准时到店。</p>
              </div>
            </div>
          `;

          const emailResp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: RESEND_FROM,
              to: [email],
              subject: `预约提醒：${serviceName} · 林梓精养馆`,
              html: emailHtml,
            }),
          });
          emailSuccess = emailResp.ok;
        } catch (e) {
          console.error("Resend fallback error:", e);
        }
      }

      const finalStatus = emailSuccess ? "sent" : "failed";
      await supabase.from("notifications").insert({
        appointment_id: apt.id,
        type: "reminder",
        channel: emailSuccess ? "email" : "pwa",
        status: finalStatus,
        sent_at: emailSuccess ? new Date().toISOString() : null,
      });

      await supabase
        .from("reminders")
        .update({ status: finalStatus })
        .eq("id", item.id);

      if (emailSuccess) sentCount++;
      else failedCount++;
    }
  }

  return json({
    ok: true,
    processed: reminderQueue?.length || 0,
    sent: sentCount,
    failed: failedCount,
    skipped: skippedCount,
  });
}

/** 处理预约表 Database Webhook 实时变动，通知老板和员工 */
async function handleAppointmentWebhook(supabase: any, payload: any) {
  const record = payload.record || payload.new;
  if (!record || !record.id) {
    return json({ message: "No record found in payload" }, 200);
  }
  const oldRecord = payload.old_record || payload.old || null;

  // 查询完整的预约详情
  const { data: apt } = await supabase
    .from("appointments")
    .select(`
      id, status, start_time,
      members ( id, name, phone, email, user_id ),
      staff ( name, user_id ),
      services ( name )
    `)
    .eq("id", record.id)
    .single();

  if (!apt) return json({ message: "Appointment not found" }, 200);

  const memberName = apt.members?.name || "新顾客";
  const serviceName = apt.services?.name || "项目";
  const staffName = apt.staff?.name || "技师";
  const timeText = TIME_FORMATTER.format(new Date(apt.start_time));

  // 1. 查找所有 admin 用户的 user_id
  const { data: adminRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  const notifyUserIds = new Set<string>();
  (adminRoles || []).forEach((r: any) => notifyUserIds.add(r.user_id));

  // 2. 如果分配了技师且有关联账号，也通知技师
  if (apt.staff?.user_id) {
    notifyUserIds.add(apt.staff.user_id);
  }

  const isInsert = payload.type === "INSERT";
  const title = isInsert ? "🔔 收到新预约通知" : "📋 预约状态变动通知";
  const bodyText = `${memberName} 预约了「${serviceName}」，时间：${timeText}，指派技师：${staffName}（状态：${apt.status}）`;

  let totalPushed = 0;
  for (const uid of notifyUserIds) {
    const res = await pushToUser(supabase, uid, {
      title,
      body: bodyText,
      url: "/admin/calendar",
      tag: `apt-${apt.id}`,
    });
    totalPushed += res.success;
  }

  // 3. 确认闭环：pending→confirmed 流转（或代客预约直建 confirmed）时，通知顾客
  const becameConfirmed =
    record.status === "confirmed" &&
    (isInsert || (oldRecord ? oldRecord.status !== "confirmed" : false));

  let customerNotified = false;
  if (becameConfirmed && apt.members?.user_id) {
    customerNotified = await notifyCustomerConfirmed(supabase, apt, {
      memberName,
      serviceName,
      staffName,
      timeText,
    });
  }

  return json({
    ok: true,
    notified_users: notifyUserIds.size,
    total_pushed: totalPushed,
    customer_notified: customerNotified,
  });
}

/**
 * 确认闭环通知顾客：PWA 系统推送优先，未订阅或推送失败时降级 Resend 邮件。
 * 以 notifications 表 (type='confirmation', status='sent') 去重，绝不重复打扰。
 */
async function notifyCustomerConfirmed(
  supabase: any,
  apt: any,
  ctx: { memberName: string; serviceName: string; staffName: string; timeText: string }
): Promise<boolean> {
  // 去重：该预约已有成功发送的确认通知则跳过
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("appointment_id", apt.id)
    .eq("type", "confirmation")
    .eq("status", "sent")
    .limit(1);

  if (existing && existing.length > 0) return false;

  const title = `预约已确认 · ${ctx.serviceName}`;
  const body = `${ctx.memberName}您好，您预约的「${ctx.serviceName}」已由店家确认，时间为 ${ctx.timeText}（技师：${ctx.staffName}），请提前 10 分钟到店。`;

  // PWA 系统推送
  const pushRes = await pushToUser(supabase, apt.members.user_id, {
    title,
    body,
    url: "/my",
    tag: `confirm-${apt.id}`,
  });

  if (pushRes.success > 0) {
    await supabase.from("notifications").insert({
      appointment_id: apt.id,
      type: "confirmation",
      channel: "pwa",
      status: "sent",
      sent_at: new Date().toISOString(),
    });
    return true;
  }

  // 邮件兜底
  const email = apt.members?.email;
  if (email && RESEND_API_KEY) {
    try {
      const emailHtml = `
        <div style="font-family: sans-serif; background-color: #f5f0e8; padding: 24px;">
          <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #b8860b; border-radius: 8px; padding: 28px;">
            <h2 style="color: #3d2b1f; margin-top: 0;">预约已确认 · 林梓精养馆</h2>
            <p style="color: #4a382b; font-size: 15px; line-height: 1.8;">
              尊敬的 <strong>${escapeHtml(ctx.memberName)}</strong>，您预约的
              <strong style="color: #b8860b;">${escapeHtml(ctx.serviceName)}</strong>
              已由店家确认，时间为 <strong>${escapeHtml(ctx.timeText)}</strong>。
            </p>
            <p style="color: #7e6350; font-size: 14px;">技师：${escapeHtml(ctx.staffName)} · 请提前 10 分钟到店</p>
            <p style="color: #7e6350; font-size: 13px;">门店地址：广州市增城区新塘镇国贸汇 林梓·头疗美容养生</p>
            <hr style="border: none; border-top: 1px solid #e7dcd2; margin: 20px 0;" />
            <p style="color: #a98f7b; font-size: 12px; margin: 0;">如需改期或取消，请提前致电门店。</p>
          </div>
        </div>`;

      const emailResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [email],
          subject: `预约已确认：${ctx.serviceName} · 林梓精养馆`,
          html: emailHtml,
        }),
      });

      const ok = emailResp.ok;
      await supabase.from("notifications").insert({
        appointment_id: apt.id,
        type: "confirmation",
        channel: "email",
        status: ok ? "sent" : "failed",
        sent_at: ok ? new Date().toISOString() : null,
      });
      return ok;
    } catch (e) {
      console.error("Confirmation email fallback error:", e);
    }
  }

  // 推送与邮件均未成功，记录失败，等待人工跟进
  await supabase.from("notifications").insert({
    appointment_id: apt.id,
    type: "confirmation",
    channel: "pwa",
    status: "failed",
  });
  return false;
}

/** 核心底层：向指定 user_id 的所有已订阅端点推送，自动清理 404/410 失效端点 */
async function pushToUser(
  supabase: any,
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<{ success: number; failed: number; cleaned: number }> {
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error || !subs || subs.length === 0) {
    return { success: 0, failed: 0, cleaned: 0 };
  }

  let success = 0;
  let failed = 0;
  let cleaned = 0;

  const payloadString = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/my",
    tag: payload.tag || "linzi-push",
    data: { url: payload.url || "/my" },
  });

  for (const sub of subs) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webpush.sendNotification(pushSubscription, payloadString);
      success++;
    } catch (err: any) {
      failed++;
      const statusCode = err.statusCode || err.status;
      // 遇到 404 Not Found 或 410 Gone，表示订阅在浏览器端已失效/注销，安全删除数据库记录
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        cleaned++;
      } else {
        console.warn(`WebPush to ${sub.endpoint} failed with code ${statusCode}:`, err.message);
      }
    }
  }

  return { success, failed, cleaned };
}
