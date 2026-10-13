/**
 * 梓养云 · 端到端测试总入口
 * 运行：npm run test:e2e
 * 依赖：本地 dev server（默认 http://localhost:3002）+ 远程 Supabase 在线
 */
import { runAll, type TestSuite } from "./setup";
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

  // 前置检查：dev server 必须在线
  try {
    const ping = await fetch("http://localhost:3002/");
    if (!ping.ok) throw new Error(`状态码 ${ping.status}`);
    console.log("前置检查：dev server 在线 ✓");
  } catch (e) {
    console.error("前置检查失败：本地 dev server (http://localhost:3002) 未响应，请先运行 npm run dev");
    console.error(String(e));
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
