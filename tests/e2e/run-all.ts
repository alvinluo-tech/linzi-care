/**
 * 梓养云 · 端到端测试总入口
 * 运行：npm run test:e2e
 * 依赖：本地 dev server（默认 http://localhost:3002）+ 远程 Supabase 在线
 *       凭据全部来自 .env.local（见 .env.example），源码不含任何密钥
 */
import "../load-env";
import { runAll, type TestSuite, SITE } from "./setup";
import { publicSpec } from "./suites/01-public.spec";
import { authSpec } from "./suites/02-auth.spec";
import { bookingSpec } from "./suites/03-booking.spec";
import { confirmSpec } from "./suites/04-confirm.spec";
import { staffSpec } from "./suites/05-staff.spec";
import { balanceSpec } from "./suites/06-balance.spec";
import { adminApiSuite } from "./suites/07-admin-api.spec";
import { cleanupSpec } from "./suites/99-cleanup.spec";

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  梓养云 · 端到端测试（真实云端环境）      ║");
  console.log("╚══════════════════════════════════════════╝");

  // 前置检查：站点必须在线。用 SITE 而非硬编码，便于换环境（staging）时复用
  try {
    const ping = await fetch(`${SITE}/`);
    if (!ping.ok) throw new Error(`状态码 ${ping.status}`);
    console.log(`前置检查：站点在线 ✓ (${SITE})`);
  } catch (e) {
    console.error(
      `前置检查失败：站点 (${SITE}) 未响应。请先运行 npm run build && npx next start -p 3002`
    );
    console.error(String(e));
    process.exit(2);
  }

  // 提前暴露缺失的凭据（清晰报错，而不是跑一半才失败）
  try {
    const { CREDENTIALS, ANON_KEY } = await import("./setup");
    if (!ANON_KEY || !CREDENTIALS.boss.email) throw new Error("凭据为空");
  } catch (e) {
    console.error("凭据检查失败：");
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }

  // 身份护栏：确认将要被扣款/删单的账号确实是测试账号。
  //
  // 为什么要在开跑前单独做一次：套件内部的 assertIsTestMember 会在动手前拦截，
  // 但那时可能已经跑过了几十个用例、改过余额。这里提前失败，既省时间，也让
  // 原因一目了然 —— 「测试账号配错了」而不是一堆莫名其妙的断言失败。
  try {
    const { makeClient } = await import("./setup");
    const { resolveTestMember } = await import("../test-guard");
    const boss = makeClient();
    const { error } = await boss.auth.signInWithPassword({
      email: process.env.E2E_ADMIN_EMAIL!,
      password: process.env.E2E_ADMIN_PASSWORD!,
    });
    if (error) throw new Error(`老板账号登录失败：${error.message}`);

    const member = await resolveTestMember(boss, "run-all 前置检查");
    console.log(
      `身份护栏：测试账号已确认 ✓ ${member.name} <${member.email}> 余额 ¥${member.balance}\n` +
        `  ⚠ 本次测试会真实修改该账号余额、并删除其带 E2E-TEST 标记的预约。`
    );
  } catch (e) {
    console.error("\n身份护栏拦截 —— 拒绝在身份不明的情况下运行破坏性测试：");
    console.error(e instanceof Error ? e.message : String(e));
    console.error(
      "\n修法：检查 .env.local 的 E2E_MEMBER_EMAIL 是否指向真正的测试账号，" +
        "必要时用 E2E_TEST_DOMAINS 指定允许的测试域名。"
    );
    process.exit(2);
  }

  const suites: TestSuite[] = [
    publicSpec,
    authSpec,
    bookingSpec,
    confirmSpec,
    staffSpec,
    balanceSpec,
    adminApiSuite,
    cleanupSpec,
  ];

  const allPass = await runAll(suites);
  process.exitCode = allPass ? 0 : 1;
}

main();
