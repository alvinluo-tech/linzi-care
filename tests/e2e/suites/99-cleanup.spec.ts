import { CREDENTIALS, ctx, E2E_TAG, expect, login, q, retry, suite } from "../setup";

/**
 * 模块七：清扫（E2E 产生的测试数据）
 * 仅删除带 E2E 标记的预约（级联清理 reminders / notifications），不动任何真实数据。
 */
export const cleanupSpec = suite("测试数据清扫", [
  {
    name: "GIVEN E2E 测试单 WHEN 清扫 THEN 按 E2E 标记删除并确认不再存在",
    run: async () => {
      const boss = ctx.boss ?? (await login(CREDENTIALS.boss.email, CREDENTIALS.boss.password));
      const toDelete = await retry(() => q(boss.from("appointments").select("id").eq("remark", E2E_TAG)));
      if (toDelete.length > 0) {
        await retry(() =>
          q(boss.from("appointments").delete().in("id", toDelete.map((r: any) => r.id)))
        );
      }
      const left = await retry(() => q(boss.from("appointments").select("id").eq("remark", E2E_TAG)));
      expect(left.length === 0, `清扫后仍残留 ${left.length} 张 E2E 测试单`);
    },
  },
  {
    name: "GIVEN 清扫后 WHEN 复查会员余额与店招 THEN 系统回归基线",
    run: async () => {
      const boss = ctx.boss;
      const member = await retry(() =>
        q(boss.from("members").select("balance").eq("id", ctx.memberId).single())
      );
      expect(
        Number(member.balance) === ctx.originalBalance,
        `余额未回归基线: ${member.balance} ≠ ${ctx.originalBalance}`
      );
      const store = await retry(() => q(boss.from("stores").select("address").limit(1).single()));
      expect(store.address.includes("国贸汇"), "门店信息异常");
    },
  },
]);
