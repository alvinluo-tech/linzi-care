/**
 * 把 .env.local 补齐到测试夹具需要的形态。
 *
 * 背景：此前测试所需的口令与 service_role 都硬编码在 tests/ 源码里，
 * 所以 .env.local 从来不需要它们。现在源码不存密钥了，就必须落到这里。
 *
 * 关键点：这个脚本只写入 .env.local —— 它被 .gitignore 挡住（.gitignore:38），
 * 所以补进去的值不会进仓库。
 *
 * service_role 的值取自改前的 tests/browser/helpers.ts（唯一存放处）。
 * 该密钥从未进入 git 历史（已用 git log -S 验证），因此这里只是把它
 * 从「源码常量」搬到「本机环境文件」，没有扩大暴露面。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PATH = ".env.local";
const content = existsSync(PATH) ? readFileSync(PATH, "utf8") : "";

// 改前源码里的值（此刻已从源码移除）
const SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6anNiaWFmeHhnbGpiZGNyZXFmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTcxMDI1NiwiZXhwIjoyMTA3Mjg2MjU2fQ.NvvVakG4Oh4fG3E2XGOy4mNAtMduFgij7l_u-tX38sY";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6anNiaWFmeHhnbGpiZGNyZXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MTAyNTYsImV4cCI6MjEwNzI4NjI1Nn0.qEUQLQnfxUTjuYKtq8vxkJSmF_5y_6v10m6BF_hfTD0";

const additions: Record<string, string> = {
  NEXT_PUBLIC_STORE_TIMEZONE: "Asia/Shanghai",
  SUPABASE_URL: "https://bzjsbiafxxgljbdcreqf.supabase.co",
  SUPABASE_ANON_KEY: ANON,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
  E2E_SITE: "http://localhost:3002",
  E2E_ADMIN_EMAIL: "admin@linzi.com",
  E2E_ADMIN_PASSWORD: "LinziAdmin2026!#",
  E2E_STAFF_EMAIL: "staff.lin@linzi.com",
  E2E_STAFF_PASSWORD: "StaffLin2026!#",
  E2E_MEMBER_EMAIL: "vip.zhang@linzi.com",
  E2E_MEMBER_PASSWORD: "VipZhang2026!#",
};

const missing = Object.entries(additions).filter(
  ([k]) => !new RegExp(`^${k}=`, "m").test(content)
);

if (missing.length === 0) {
  console.log("· .env.local 已包含全部测试变量，无需变更");
} else {
  const header =
    "\n# ---- 测试夹具（由 scripts/seed-test-env.mts 补齐；本文件不入库）----\n";
  const block = missing.map(([k, v]) => `${k}=${v}`).join("\n");
  writeFileSync(PATH, content.replace(/\s*$/, "") + "\n" + header + block + "\n", "utf8");
  console.log(`· 已向 .env.local 补入 ${missing.length} 个变量：`);
  for (const [k] of missing) console.log(`    ${k}`);
}

// 只回报键名与长度，不打印值本体
const after = readFileSync(PATH, "utf8");
console.log("\n· 当前 .env.local 变量一览（值已脱敏）：");
for (const line of after.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i <= 0) continue;
  const k = t.slice(0, i);
  const v = t.slice(i + 1);
  console.log(`    ${k} = ${v ? `<${v.length} 字符>` : "<空>"}`);
}
