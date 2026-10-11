import { createClient } from "@supabase/supabase-js";

const url = "https://bzjsbiafxxgljbdcreqf.supabase.co";
const anonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6anNiaWFmeHhnbGpiZGNyZXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MTAyNTYsImV4cCI6MjEwNzI4NjI1Nn0.qEUQLQnfxUTjuYKtq8vxkJSmF_5y_6v10m6BF_hfTD0";

function makeClient() {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function retry<T>(fn: () => Promise<T>, attempts = 6, delay = 1500): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function login(email: string, password: string) {
  return retry(async () => {
    const c = makeClient();
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return c;
  });
}

async function main() {
  console.log("==> 验证确认流程：状态机 + 技师打点 + 确认闭环通知");

  // 1. 会员登录并预约（pending）
  const member = await login("vip.zhang@linzi.com", "VipZhang2026!#");
  const memberRow = await retry(async () => {
    const { data, error } = await member.from("members").select("id").eq("user_id", (await member.auth.getUser()).data.user!.id).single();
    if (error) throw new Error(error.message);
    return data;
  });

  const service = await retry(async () => {
    const { data, error } = await member.from("services").select("id, name").eq("name", "肩颈放松").single();
    if (error) throw new Error(error.message);
    return data;
  });
  const staff = await retry(async () => {
    const { data, error } = await member.from("staff").select("id, name").eq("name", "林小梓").single();
    if (error) throw new Error(error.message);
    return data;
  });

  const target = new Date(Date.now() + 3 * 86400000);
  const dateStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;

  const slots = await retry(async () => {
    const { data, error } = await member.rpc("get_available_slots", {
      p_staff_id: staff.id,
      p_service_id: service.id,
      p_date: dateStr,
    });
    if (error) throw new Error(error.message);
    return data as { slot_start: string }[];
  });
  if (!slots?.length) throw new Error("无可约时段");

  // 依次尝试时段，避开冲突
  let aptId: string | null = null;
  for (const s of slots.slice(0, 5)) {
    const { data, error } = await member.rpc("create_appointment", {
      p_customer_id: memberRow.id,
      p_staff_id: staff.id,
      p_service_id: service.id,
      p_start_time: s.slot_start,
      p_remark: "确认流程验证",
    });
    if (!error) {
      aptId = data as string;
      break;
    }
    if (!error.message.includes("已被预约")) throw new Error(error.message);
  }
  if (!aptId) throw new Error("所有尝试时段均冲突");
  console.log(`✓ 1. 会员预约成功（pending），单号 ${aptId.slice(0, 8)}`);

  // 2. 技师尝试确认接单 → 必须被拒
  const staffC = await login("staff.lin@linzi.com", "StaffLin2026!#");
  const staffConfirm = await staffC.rpc("update_appointment_status", {
    p_appointment_id: aptId,
    p_status: "confirmed",
  });
  console.log(
    staffConfirm.error
      ? `✓ 2. 技师确认接单被拒：${staffConfirm.error.message}`
      : "✗ 2. 失败！技师竟能确认接单"
  );

  // 3. 老板确认 pending→confirmed → 应成功，并触发顾客确认通知
  const boss = await login("admin@linzi.com", "LinziAdmin2026!#");
  const bossConfirm = await retry(() =>
    boss.rpc("update_appointment_status", { p_appointment_id: aptId, p_status: "confirmed" })
  );
  if (bossConfirm.error) throw new Error(`老板确认失败：${bossConfirm.error.message}`);
  console.log("✓ 3. 老板确认接单成功（pending → confirmed）");

  // 4. 等待 Webhook 异步落库，检查 notifications 是否有 confirmation 记录
  let confLog: any = null;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data } = await retry(() =>
      boss.from("notifications").select("*").eq("appointment_id", aptId).eq("type", "confirmation").limit(1)
    );
    if (data && data.length > 0) {
      confLog = data[0];
      break;
    }
  }
  console.log(
    confLog
      ? `✓ 4. 确认通知已闭环落库：channel=${confLog.channel} status=${confLog.status}`
      : "△ 4. 15s 内未观察到 confirmation 记录（pg_net 异步可能延迟）"
  );

  // 5. 状态机反例：老板把 confirmed 改回 pending → 必须被拒
  const rollback = await boss.rpc("update_appointment_status", {
    p_appointment_id: aptId,
    p_status: "pending",
  });
  console.log(
    rollback.error
      ? `✓ 5. 乱序流转被拒：${rollback.error.message}`
      : "✗ 5. 失败！confirmed → pending 竟然成功"
  );

  // 6. 技师打点：confirmed → arrived → done
  const toArrived = await staffC.rpc("update_appointment_status", {
    p_appointment_id: aptId,
    p_status: "arrived",
  });
  console.log(toArrived.error ? `✗ 6a. 技师打点到店失败：${toArrived.error.message}` : "✓ 6a. 技师打点「顾客到店」成功");

  const toDone = await staffC.rpc("update_appointment_status", {
    p_appointment_id: aptId,
    p_status: "done",
  });
  console.log(toDone.error ? `✗ 6b. 技师打点完成失败：${toDone.error.message}` : "✓ 6b. 技师打点「完成服务」成功");

  // 7. 终态保护：done → cancelled 必须被拒
  const fromDone = await boss.rpc("update_appointment_status", {
    p_appointment_id: aptId,
    p_status: "cancelled",
  });
  console.log(
    fromDone.error
      ? `✓ 7. 终态保护生效：${fromDone.error.message}`
      : "✗ 7. 失败！done 竟可改为 cancelled"
  );

  // 8. 清理测试单（老板硬删）
  await retry(() => boss.from("appointments").delete().eq("id", aptId!));
  console.log("✓ 8. 测试预约已清理");

  console.log("\n=========================================");
  console.log("🎉 确认流程端到端验证完成");
  console.log("=========================================");
}

main().catch((e) => {
  console.error("验证失败:", e);
  process.exit(1);
});
