/**
 * 从 .env.local 的现有值生成测试变量清单。
 *
 * ⚠ 本脚本**不再内置任何密钥**。
 *
 * 它最初是为了把散落在 tests/ 源码里的凭据一次性搬进 .env.local 而写的，
 * 当时把 service_role / anon key / 账号口令当成常量内嵌了进来 ——
 * 等于把刚搬走的东西又抄了一份进源码，而且它进了 git 索引。这是个错误，
 * 已删除。教训记在这里：**搬运密钥的脚本本身也就成了密钥的载体**，
 * 这类一次性脚本要么不落盘，要么只从环境读取。
 *
 * 现在它只做一件事：把 .env.local 里已有的值映射成测试变量名。
 * 缺少的变量会列出来，由使用者自行填入（值从 Supabase 控制台获取）。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PATH = ".env.local";

if (!existsSync(PATH)) {
  console.error(`未找到 ${PATH}。请先复制 .env.example 并填入 Supabase 配置。`);
  process.exit(1);
}

const content = readFileSync(PATH, "utf8");

function read(key: string): string | null {
  const m = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim() : null;
}

// 从已有的 NEXT_PUBLIC_* 派生测试用变量（值相同或可从其推导）
const derived: Record<string, string> = {};

const url = read("NEXT_PUBLIC_SUPABASE_URL");
const anon = read("NEXT_PUBLIC_SUPABASE_ANON_KEY");

if (url) derived.SUPABASE_URL = url;
if (anon) derived.SUPABASE_ANON_KEY = anon;
if (!read("NEXT_PUBLIC_STORE_TIMEZONE"))
  derived.NEXT_PUBLIC_STORE_TIMEZONE = "Asia/Shanghai";
if (!read("E2E_SITE")) derived.E2E_SITE = "http://localhost:3002";

// 这些**无法**自动派生，必须由使用者提供 —— 脚本只负责提示，不负责提供值
const mustBeProvided = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "E2E_ADMIN_EMAIL",
  "E2E_ADMIN_PASSWORD",
  "E2E_STAFF_EMAIL",
  "E2E_STAFF_PASSWORD",
  "E2E_MEMBER_EMAIL",
  "E2E_MEMBER_PASSWORD",
];

const missingDerived = Object.entries(derived).filter(
  ([k]) => !new RegExp(`^${k}=`, "m").test(content)
);

if (missingDerived.length > 0) {
  const header =
    "\n# ---- 测试夹具（由 scripts/seed-test-env.mts 生成；本文件不入库）----\n";
  const block = missingDerived.map(([k, v]) => `${k}=${v}`).join("\n");
  writeFileSync(
    PATH,
    content.replace(/\s*$/, "") + "\n" + header + block + "\n",
    "utf8"
  );
  console.log(`· 已补入 ${missingDerived.length} 个可从现有值派生的变量：`);
  for (const [k] of missingDerived) console.log(`    ${k}`);
} else {
  console.log("· 可派生的测试变量都已存在");
}

// 检查必填项；缺失只提示，不代替使用者生成
const stillMissing = mustBeProvided.filter(
  (k) => !new RegExp(`^${k}=`, "m").test(readFileSync(PATH, "utf8"))
);

if (stillMissing.length > 0) {
  console.log(`\n⚠ 以下变量必须由你手动填写（值从 Supabase 控制台获取）：`);
  for (const k of stillMissing) console.log(`    ${k}`);
  console.log(
    `\n  提示：SUPABASE_SERVICE_ROLE_KEY 在 Project Settings → API 页；\n` +
      `        三个账号的口令即你自己设置的登录密码。\n` +
      `  这些值**不应**写进任何脚本或提交进仓库。`
  );
  process.exitCode = 1;
} else {
  console.log("\n· 测试变量已齐备");
}

// 只回报键名，绝不打印值
console.log("\n· 当前 .env.local 变量一览（值已脱敏）：");
for (const line of readFileSync(PATH, "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i <= 0) continue;
  console.log(`    ${t.slice(0, i)} = <${t.slice(i + 1).length} 字符>`);
}
