import { CREDENTIALS, ctx, expect, login, q, retry, suite, waitFor } from "../setup";

/**
 * 模块四：老板确认流程与确认闭环通知
 */
export const confirmSpec = suite("老板确认流程与确认闭环通知", [
  {
    name: "GIVEN 存在待确认单 WHEN 老板视角查询 THEN 能看到 pending 单",
    run: async () => {
      const boss = await login(CREDENTIALS.boss.email, CREDENTIALS.boss.password);
      ctx.boss = boss;

      const row = await retry(() =>
        q(
          boss
            .from("appointments")
            .select("id, status, customer_id, staff_id")
            .eq("id", ctx.apptId)
            .single()
        )
      );
      expect(!!row, "老板读取预约失败");
      expect(row.status === "pending", `单据状态应为 pending，实际 ${row.status}`);
    },
  },
  {
    name: "GIVEN 技师尝试确认接单 WHEN 调用状态流转 THEN 被状态机拒绝",
    run: async () => {
      const staff = await login(CREDENTIALS.staff.email, CREDENTIALS.staff.password);
      ctx.staff = staff;
      const { error } = await staff.rpc("update_appointment_status", {
        p_appointment_id: ctx.apptId,
        p_status: "confirmed",
      });
      expect(!!error, "技师竟能确认接单");
      expect(error!.message.includes("技师仅可执行"), `拒绝原因异常: ${error!.message}`);
    },
  },
  {
    name: "GIVEN 老板确认接单 WHEN pending→confirmed THEN 成功且触发顾客确认通知（notifications 落库）",
    run: async () => {
      const boss = ctx.boss;
      await retry(() =>
        boss.rpc("update_appointment_status", {
          p_appointment_id: ctx.apptId,
          p_status: "confirmed",
        })
      );

      const row = await retry(() =>
        q(ctx.boss.from("appointments").select("status").eq("id", ctx.apptId).single())
      );
      expect(row.status === "confirmed", `确认后状态异常: ${row.status}`);

      // 等待 Webhook 异步链路：trigger → pg_net → send-push → notifications
      const log = await waitFor(async () => {
        try {
          const rows = await q(
            boss
              .from("notifications")
              .select("id, channel, status")
              .eq("appointment_id", ctx.apptId)
              .eq("type", "confirmation")
              .limit(1)
          );
          return rows.length > 0 ? rows[0] : null;
        } catch {
          return null;
        }
      }, 30000);
      expect(!!log, "30s 内未观察到顾客确认通知记录（Webhook 链路异常）");

      // 投递渠道感知断言：
      // - 会员存在 PWA 订阅时，push 必须成功（sent）；
      // - 无订阅且未配置 Resend 时，系统按设计落库 failed（channel=pwa）等待人工跟进，
      //   这同样证明链路正确；
      // - 邮件渠道 failed、或有订阅但推送 failed，都视为真实故障。
      const memberRow = await retry(() =>
        q(
          ctx.boss
            .from("members")
            .select("user_id")
            .eq("id", ctx.memberId)
            .single()
        )
      );
      const subs = await retry(() =>
        q(
          ctx.boss
            .from("push_subscriptions")
            .select("id")
            .eq("user_id", memberRow.user_id)
            .limit(1)
        )
      );
      const hasPushChannel = subs.length > 0;

      const chainOk =
        log!.status === "sent" ||
        (log!.status === "failed" && log!.channel === "pwa" && !hasPushChannel);
      expect(
        chainOk,
        `确认通知链路异常: status=${log!.status}, channel=${log!.channel}, 会员推送订阅=${hasPushChannel}（email 渠道 failed 或已订阅仍失败都属故障）`
      );
      ctx.confirmChannel = log!.channel;
    },
  },
  {
    name: "GIVEN 确认通知已发送 WHEN 检查重复 THEN 该预约仅有一条 confirmation 记录（去重）",
    run: async () => {
      const boss = ctx.boss;
      const logs = await retry(() =>
        q(
          boss
            .from("notifications")
            .select("id")
            .eq("appointment_id", ctx.apptId)
            .eq("type", "confirmation")
        )
      );
      expect(logs.length === 1, `confirmation 记录应为 1 条，实际 ${logs.length}`);
    },
  },
]);
