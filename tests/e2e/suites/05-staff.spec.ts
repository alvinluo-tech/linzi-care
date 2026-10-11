import { CREDENTIALS, ctx, expect, login, makeClient, q, retry, suite } from "../setup";

/**
 * 模块五：技师打点与状态机硬约束
 */
export const staffSpec = suite("技师打点与状态机硬约束", [
  {
    name: "GIVEN 已确认单 WHEN 技师打点「顾客到店」 THEN 成功且状态 arrived",
    run: async () => {
      const staff = ctx.staff ?? (await login(CREDENTIALS.staff.email, CREDENTIALS.staff.password));
      await retry(() =>
        staff.rpc("update_appointment_status", {
          p_appointment_id: ctx.apptId,
          p_status: "arrived",
        })
      );
      const row = await retry(() =>
        q(makeClient().from("appointments").select("status").eq("id", ctx.apptId).single())
      );
      expect(row.status === "arrived", `状态应为 arrived，实际 ${row.status}`);
    },
  },
  {
    name: "GIVEN 已到店 WHEN 技师打点「完成服务」 THEN 成功且状态 done",
    run: async () => {
      const staff = ctx.staff;
      await retry(() =>
        staff.rpc("update_appointment_status", {
          p_appointment_id: ctx.apptId,
          p_status: "done",
        })
      );
      const row = await retry(() =>
        q(makeClient().from("appointments").select("status").eq("id", ctx.apptId).single())
      );
      expect(row.status === "done", `状态应为 done，实际 ${row.status}`);
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

      expect(
        !error && count === 0,
        `会员直改预约状态应被 RLS 拦截为 0 行，实际 error=${error?.message} count=${count}`
      );
      const row = await retry(() =>
        q(makeClient().from("appointments").select("status").eq("id", ctx.apptId).single())
      );
      expect(row.status === "done", "会员直改后状态竟发生变化");
    },
  },
]);
