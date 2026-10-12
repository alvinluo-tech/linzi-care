import { CREDENTIALS, ctx, expect, login, q, retry, suite } from "../setup";

/**
 * 模块六：会员余额安全与审计
 */
export const balanceSpec = suite("会员余额安全与审计", [
  {
    name: "GIVEN 会员 WHEN 直接 UPDATE 自己的 balance THEN 被触发器/列权限拒绝",
    run: async () => {
      const member = ctx.member;
      const { error } = await member
        .from("members")
        .update({ balance: 999999 } as any)
        .eq("id", ctx.memberId);

      expect(!!error, "会员直改余额竟未报错，安全防线失效！");
      expect(
        error!.message.includes("安全策略") || error!.message.includes("余额"),
        `拒绝原因异常: ${error!.message}`
      );

      // 用会员自己的客户端验证（RLS：会员可见本人余额；匿名不可见）
      const row = await retry(() =>
        q(ctx.member.from("members").select("balance").eq("id", ctx.memberId).single())
      );
      // 注意：不要在这里覆盖 ctx.originalBalance。
      // 「预约即扣款」生效后，此时余额已被前面的预约扣减，用它当基线会让
      // 清理阶段的退款显得「多退」。基线已在 booking 套件、任何预约产生之前记录。
      expect(Number(row.balance) !== 999999, "余额竟被篡改");
    },
  },
  {
    name: "GIVEN 会员 WHEN 调用 admin_update_balance RPC THEN 被拒（权限不足）",
    run: async () => {
      const member = ctx.member;
      const { error } = await member.rpc("admin_update_balance", {
        p_member_id: ctx.memberId,
        p_new_balance: 100,
      });
      expect(!!error, "会员竟能调用余额调整 RPC");
      expect(error!.message.includes("权限不足"), `拒绝原因异常: ${error!.message}`);
    },
  },
  {
    name: "GIVEN 老板 WHEN RPC 调整余额 +100 THEN 成功且 balance_logs 审计 delta 正确",
    run: async () => {
      const boss = ctx.boss;
      const before = await retry(() =>
        q(boss.from("members").select("balance").eq("id", ctx.memberId).single())
      );
      ctx.balanceBefore = Number(before.balance);

      await retry(() =>
        boss.rpc("admin_update_balance", {
          p_member_id: ctx.memberId,
          p_new_balance: ctx.balanceBefore + 100,
          p_reason: "E2E-TEST 充值验证",
        })
      );

      const after = await retry(() =>
        q(boss.from("members").select("balance").eq("id", ctx.memberId).single())
      );
      expect(Number(after.balance) === ctx.balanceBefore + 100, "余额变动数额不正确");

      const log = await retry(() =>
        q(
          boss
            .from("balance_logs")
            .select("*")
            .eq("member_id", ctx.memberId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single()
        )
      );
      expect(Number(log.delta) === 100, `审计 delta 应为 100，实际 ${log.delta}`);
      expect(log.reason === "E2E-TEST 充值验证", "审计事由不正确");
      expect(
        Number(log.old_balance) === ctx.balanceBefore &&
          Number(log.new_balance) === ctx.balanceBefore + 100,
        "审计新旧余额不正确"
      );
    },
  },
  {
    name: "GIVEN 老板 WHEN RPC 设置负数余额 THEN 被拒",
    run: async () => {
      const boss = ctx.boss;
      const { error } = await boss.rpc("admin_update_balance", {
        p_member_id: ctx.memberId,
        p_new_balance: -1,
      });
      expect(!!error, "负数余额竟能设置");
      expect(error!.message.includes("余额不能为负"), `拒绝原因异常: ${error!.message}`);
    },
  },
  {
    name: "GIVEN 测试完成 WHEN 恢复原始余额 THEN 审计再记一笔且余额复原",
    run: async () => {
      const boss = ctx.boss;
      // 复原到「本次 +100 之前」的值（ctx.balanceBefore），而不是更早的记账基线：
      // 「预约即扣款」生效后，此前的预约已经合法扣走了钱，强行回到更早的基线
      // 会凭空补钱，并让清理阶段的退款变成一笔多退。
      await retry(() =>
        boss.rpc("admin_update_balance", {
          p_member_id: ctx.memberId,
          p_new_balance: ctx.balanceBefore,
          p_reason: "E2E-TEST 余额复原",
        })
      );
      const row = await retry(() =>
        q(boss.from("members").select("balance").eq("id", ctx.memberId).single())
      );
      expect(Number(row.balance) === ctx.balanceBefore, "余额未复原");
    },
  },
]);
