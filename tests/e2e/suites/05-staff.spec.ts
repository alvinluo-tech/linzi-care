import { CREDENTIALS, ctx, expect, login, q, retry, suite } from "../setup";

/**
 * 模块五：技师打点与状态机硬约束
 */
export const staffSpec = suite("技师打点与状态机硬约束", [
  {
    name: "GIVEN 已确认单 WHEN 技师打点「顾客到店」 THEN 成功且状态 arrived",
    run: async () => {
      const staff = ctx.staff ?? (await login(CREDENTIALS.staff.email, CREDENTIALS.staff.password));
      // RPC 失败必须显式断言：supabase-js 不 throw，忽略 error 会让"被外部干扰
      // （如真人同时在操作管理端把单据流转走）"伪装成后续断言的神秘失败。
      const { error } = await retry(() =>
        staff.rpc("update_appointment_status", {
          p_appointment_id: ctx.apptId,
          p_status: "arrived",
        })
      );
      expect(!error, `技师打点「顾客到店」失败（可能被其他操作抢先流转）: ${error?.message}`);
      const row = await retry(() =>
        q(ctx.boss.from("appointments").select("status").eq("id", ctx.apptId).single())
      );
      expect(row.status === "arrived", `状态应为 arrived，实际 ${row.status}`);
    },
  },
  {
    name: "GIVEN 已到店 WHEN 技师打点「完成服务」 THEN 成功且状态 done",
    run: async () => {
      const staff = ctx.staff;
      const { error } = await retry(() =>
        staff.rpc("update_appointment_status", {
          p_appointment_id: ctx.apptId,
          p_status: "done",
        })
      );
      expect(!error, `技师打点「完成服务」失败: ${error?.message}`);
      const row = await retry(() =>
        q(
          ctx.boss
            .from("appointments")
            .select("status, charged_amount, payment_state")
            .eq("id", ctx.apptId)
            .single()
        )
      );
      expect(row.status === "done", `状态应为 done，实际 ${row.status}`);
      // 记录本次「真正履约完成」的金额：清理阶段校验余额时，
      // 完成的单是消费掉的（不退），需从基线中扣除。
      ctx.e2eCompletedValue = Number(row.charged_amount ?? 0);
    },
  },
  {
    name: "GIVEN 终态 done WHEN 任何人尝试再流转（老板改取消 / 技师改完成） THEN 全部被状态机拒绝",
    run: async () => {
      const attempts: [string, any, string][] = [
        ["老板 done→cancelled", ctx.boss, "cancelled"],
        ["老板 done→confirmed", ctx.boss, "confirmed"],
        ["技师 done→no_show", ctx.staff, "no_show"],
      ];
      for (const [label, client, target] of attempts) {
        const { error } = await client.rpc("update_appointment_status", {
          p_appointment_id: ctx.apptId,
          p_status: target,
        });
        expect(!!error, `${label} 竟然成功，终态保护失效`);
        expect(
          error!.message.includes("不允许的状态流转"),
          `${label} 拒绝原因异常: ${error!.message}`
        );
      }
    },
  },
  {
    name: "GIVEN 技师 WHEN 尝试取消（cancelled） THEN 被拒（取消权归老板）",
    run: async () => {
      const staff = ctx.staff;
      const { error } = await staff.rpc("update_appointment_status", {
        p_appointment_id: ctx.apptId,
        p_status: "cancelled",
      });
      expect(!!error, "技师竟能取消");
      expect(error!.message.includes("技师仅可执行"), `拒绝原因异常: ${error!.message}`);
    },
  },
  {
    name: "GIVEN 会员 WHEN 直接 UPDATE 预约状态 THEN RLS 拦截，0 行生效",
    run: async () => {
      const member = ctx.member;
      const { data, error, count } = await member
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", ctx.apptId)
        .select("id", { count: "exact" });

      // PostgREST 对 RLS 拦截的 0 行更新：无 error、data 为空数组、count 为 0 或 null
      expect(
        !error && data.length === 0 && (count ?? 0) === 0,
        `会员直改预约状态应被 RLS 拦截为 0 行，实际 error=${error?.message} count=${count} data=${JSON.stringify(data)}`
      );
      const row = await retry(() =>
        q(ctx.boss.from("appointments").select("status").eq("id", ctx.apptId).single())
      );
      expect(row.status === "done", "会员直改后状态竟发生变化");
    },
  },
]);
