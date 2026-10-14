import { CREDENTIALS, ctx, E2E_TAG, expect, login, q, retry, suite } from "../setup";
import { assertIsTestMember } from "../../test-guard";

/**
 * 模块七：清扫（E2E 产生的测试数据）
 * 仅删除带 E2E 标记的预约（级联清理 reminders / notifications），不动任何真实数据。
 */
export const cleanupSpec = suite("测试数据清扫", [
  {
    name: "GIVEN E2E 测试单 WHEN 清扫 THEN 按 E2E 标记删除且未退款金额被精确退回",
    run: async () => {
      const boss = ctx.boss ?? (await login(CREDENTIALS.boss.email, CREDENTIALS.boss.password));

      // 删除预约会触发结算触发器退款，因此退款最终落到 ctx.memberId 的余额上。
      // 动手之前再次确认这个 id 仍是测试账号：万一前面的套件因为配置错误
      // 把 ctx.memberId 指到了真实顾客身上，这里必须拦住。
      const target = await retry(() =>
        q(boss.from("members").select("id, name, email, balance").eq("id", ctx.memberId).single())
      );
      assertIsTestMember(target, "99-cleanup 清扫前复核");

      // 删除前记录：待删单里还有多少「已扣未退」的钱，以及当前余额。
      // 「预约即扣款」下，删除预约会触发结算触发器退款，故删除后余额应增加这部分金额。
      const toDelete = await retry(() =>
        q(
          boss
            .from("appointments")
            .select("id, payment_state, charged_amount")
            .eq("remark", E2E_TAG)
        )
      );
      const before = await retry(() =>
        q(boss.from("members").select("balance").eq("id", ctx.memberId).single())
      );
      const balanceBefore = Number(before.balance);
      const expectedRefund = (toDelete as any[])
        .filter((r) => r.payment_state === "charged" && Number(r.charged_amount) > 0)
        .reduce((s, r) => s + Number(r.charged_amount), 0);

      if (toDelete.length > 0) {
        await retry(() =>
          q(boss.from("appointments").delete().in("id", toDelete.map((r: any) => r.id)))
        );
      }

      const left = await retry(() => q(boss.from("appointments").select("id").eq("remark", E2E_TAG)));
      expect(left.length === 0, `清扫后仍残留 ${left.length} 张 E2E 测试单`);

      // 退款正确性：余额应精确增加「已扣未退」的金额
      const after = await retry(() =>
        q(boss.from("members").select("balance").eq("id", ctx.memberId).single())
      );
      expect(
        Number(after.balance) === balanceBefore + expectedRefund,
        `删除退款不准确：${balanceBefore} + ${expectedRefund} ≠ ${after.balance}`
      );
    },
  },
  {
    name: "GIVEN 清扫后 WHEN 复查会员余额与店招 THEN 系统回归基线",
    run: async () => {
      const boss = ctx.boss;
      const member = await retry(() =>
        q(boss.from("members").select("balance").eq("id", ctx.memberId).single())
      );
      // 「预约即扣款」下的期望余额 = 记账基线 − 本次真正履约完成的服务金额。
      // 完成(done)的单进入 completed，钱是消费掉的、不退；取消/作废/删除的单已全额退回。
      // 因此不能直接比对基线，必须扣除「已履约」的部分。
      const expected =
        Number(ctx.originalBalance) - Number(ctx.e2eCompletedValue ?? 0);
      expect(
        Number(member.balance) === expected,
        `余额未回归期望基线: ${member.balance} ≠ ${expected}（基线 ${ctx.originalBalance} − 已履约 ${ctx.e2eCompletedValue ?? 0}）`
      );
      const store = await retry(() => q(boss.from("stores").select("address").limit(1).single()));
      expect(store.address.includes("国贸汇"), "门店信息异常");
    },
  },
]);
