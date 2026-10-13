/**
 * 一次性运维脚本：把 E2E 会员（vip.zhang）余额恢复到可跑通的基线。
 *
 * 背景：E2E 套件用的是线上真实库，且与真实用户共用同一份数据。
 * 实测发现 vip.zhang 余额被扣到 ¥28，低于单笔预约所需 ¥38，
 * 导致「create_appointment 余额不足」进而整条预约链路 14 项连锁失败——
 * 这是测试环境数据漂移，不是产品缺陷。本脚本走老板身份 RPC 调整，
 * 与其他正常调整完全同路径（同样写 balance_logs 审计）。
 *
 * 用法：npx tsx scripts/reset-e2e-baseline.ts
 */
import { login, q, retry, CREDENTIALS, E2E_TAG } from "../tests/e2e/setup";

const TARGET_BALANCE = 1000;

interface MemberRow {
  id: string;
  name: string;
  balance: number | string;
}

async function main() {
  const boss = await login(CREDENTIALS.boss.email, CREDENTIALS.boss.password);
  const member = await retry(() =>
    q<MemberRow | null>(
      boss
        .from("members")
        .select("id, name, balance")
        .eq("email", CREDENTIALS.member.email)
        .single()
    )
  );

  if (!member) {
    console.error(`未找到 E2E 会员 ${CREDENTIALS.member.email}`);
    process.exit(1);
  }

  console.log(`当前：${member.name} 余额 ¥${member.balance}`);

  if (Number(member.balance) === TARGET_BALANCE) {
    console.log("无需调整。");
    return;
  }

  // admin_update_balance 收的是「目标余额绝对值」（p_new_balance），不是增量。
  const { error } = await boss.rpc("admin_update_balance", {
    p_member_id: member.id,
    p_new_balance: TARGET_BALANCE,
    p_reason: `${E2E_TAG} 余额基线复位`,
  });
  if (error) {
    console.error("调整失败：", error.message);
    process.exit(1);
  }

  const after = await retry(() =>
    q<Pick<MemberRow, "balance"> | null>(
      boss.from("members").select("balance").eq("id", member.id).single()
    )
  );
  console.log(`已重置为 ¥${after?.balance ?? "?"}`);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
