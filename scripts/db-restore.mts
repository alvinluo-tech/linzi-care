/**
 * 数据库恢复 —— 把 JSON 快照导回 Supabase。
 *
 * 设计取舍：**默认是 dry-run**。
 * 恢复是破坏性操作（会清空现有表再写入），而「恢复备份」往往发生在最慌的
 * 时刻 —— 那时候最容易点错。所以必须显式加 --apply 才真正写库，
 * 且 --apply 时要求目标库与快照来源一致（除非显式 --force）。
 *
 * 用法：
 *   npx tsx scripts/db-restore.mts backups/linzi-care_xxx          # 预演（不写库）
 *   npx tsx scripts/db-restore.mts backups/linzi-care_xxx --apply  # 真正恢复
 *   npx tsx scripts/db-restore.mts backups/linzi-care_xxx --apply --force  # 跨项目
 *
 * 恢复顺序：先删后插，按依赖倒序删、正序插。
 * 注意 auth.users 不在快照内（Supabase 托管表），账号本身不会被恢复 ——
 * 用户需要重新通过后台建号，或从 Supabase 侧另行恢复。
 */
import fs from "node:fs";
import path from "node:path";
import { fetch as uf, EnvHttpProxyAgent } from "undici";
import { loadEnv } from "../tests/load-env";

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY。");
  process.exit(1);
}

const proxy = process.env.E2E_PROXY ?? "http://127.0.0.1:7897";
const dispatcher = new EnvHttpProxyAgent({
  httpProxy: proxy,
  httpsProxy: proxy,
  noProxy: "localhost,127.0.0.1",
});

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const dir = process.argv[2];
const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");

if (!dir || dir.startsWith("--")) {
  console.error("用法：npx tsx scripts/db-restore.mts <快照目录> [--apply] [--force]");
  process.exit(1);
}
if (!fs.existsSync(dir)) {
  console.error(`快照目录不存在：${dir}`);
  process.exit(1);
}

const metaRaw = fs.readFileSync(path.join(dir, "_manifest.json"), "utf8");
const meta = JSON.parse(metaRaw) as {
  project: string;
  takenAt: string;
  totalRows: number;
  order: string[];
  tables: Record<string, { rows: number; columns: string[] }>;
};

console.log("=".repeat(60));
console.log(`快照来源项目：${meta.project}`);
console.log(`快照时间：    ${meta.takenAt}`);
console.log(`当前目标项目：${SUPABASE_URL}`);
console.log(`模式：        ${apply ? "★ 真正写入 (--apply)" : "预演（不写库）"}`);
console.log("=".repeat(60));

if (apply && meta.project !== SUPABASE_URL && !force) {
  console.error(
    "\n✗ 目标库与快照来源不一致，拒绝写入。\n" +
      `  快照来自：${meta.project}\n` +
      `  当前目标：${SUPABASE_URL}\n` +
      "  这通常意味着配错了环境。确实要跨项目恢复，请加 --force。"
  );
  process.exit(1);
}

/**
 * 清空整表（按依赖倒序，先删引用方）。
 *
 * 不能假设每张表都有 id 列 —— staff_services 是复合主键的关联表（只有
 * staff_id / service_id）。因此从快照清单里读出每张表的**实际列名**，
 * 取第一个可用的列作过滤条件。硬编码猜列名已经踩过一次坑。
 */
function keyColumn(table: string): string {
  const cols = meta.tables[table]?.columns ?? [];
  if (cols.includes("id")) return "id";
  if (cols.length) return cols[0]; // staff_services → staff_id
  return "id";
}

async function truncate(table: string) {
  const col = keyColumn(table);
  const url = `${SUPABASE_URL}/rest/v1/${table}?${col}=not.is.null`;
  const res = await uf(url, { method: "DELETE", headers: HEADERS, dispatcher });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`清空 ${table} 失败：HTTP ${res.status} ${body.slice(0, 200)}`);
  }
}

/**
 * 生成列不能写入（PostgreSQL 报 428C9）。
 *
 * 例如 balance_logs.delta = new_balance - old_balance 是 `generated always as
 * ... stored`，快照里带着它导出，直接回灌会被拒绝。
 *
 * PostgREST 的 OpenAPI 描述**不会**标注哪个列是生成列（实测 delta 只有
 * format: numeric，没有任何标记），所以没法事先探测。这里改为让数据库
 * 自己回答：遇到 428C9 就把报错点名的列剔掉重试，并记住它。
 */
const droppedColumns = new Map<string, Set<string>>();

async function insert(table: string, rows: unknown[]): Promise<number> {
  if (!rows.length) return 0;

  const skip = droppedColumns.get(table) ?? new Set<string>();
  const build = () =>
    rows.map((r) => {
      const o = { ...(r as Record<string, unknown>) };
      for (const k of skip) delete o[k];
      return o;
    });

  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await uf(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...HEADERS, Prefer: "return=minimal" },
      dispatcher,
      body: JSON.stringify(build()),
    });
    if (res.ok) return rows.length;

    const body = await res.text();
    // PostgREST 错误体里的列名是**转义**过的：\"delta\"
    // 因此正则必须写成 \\" 才能匹配到（写成 \" 会静默失效，已踩）。
    const m = /generated column/i.test(body)
      ? body.match(/column \\"([^"\\]+)\\"/i)
      : null;
    if (m) {
      skip.add(m[1]);
      droppedColumns.set(table, skip);
      console.log(`    （跳过生成列 ${table}.${m[1]}，重试）`);
      continue;
    }
    throw new Error(`写入 ${table} 失败：HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  throw new Error(`写入 ${table} 失败：生成列处理重试次数用尽`);
}

const order = meta.order;
const reverse = [...order].reverse();

console.log("\n删除顺序（倒序）：", reverse.join(" → "));
console.log("插入顺序（正序）：", order.join(" → "));

if (!apply) {
  console.log("\n【预演】以下操作将被执行：");
  for (const t of reverse) console.log(`  DELETE FROM ${t}`);
  for (const t of order) {
    const f = path.join(dir, `${t}.json`);
    const n = fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as unknown[]).length : 0;
    console.log(`  INSERT ${String(n).padStart(4)} 行 → ${t}`);
  }
  console.log("\n预演结束，未改动任何数据。确认无误后加 --apply 执行。");
  process.exit(0);
}

console.log("\n开始恢复…\n");
for (const t of reverse) {
  await truncate(t);
  console.log(`  已清空 ${t}`);
}

for (const t of order) {
  const f = path.join(dir, `${t}.json`);
  if (!fs.existsSync(f)) {
    console.log(`  跳过 ${t}（快照里没有）`);
    continue;
  }
  const rows = JSON.parse(fs.readFileSync(f, "utf8")) as unknown[];
  // 分块写入：单次请求体过大容易被网关拒绝
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    written += await insert(t, rows.slice(i, i + CHUNK));
  }
  console.log(`  已写入 ${String(written).padStart(4)} 行 → ${t}`);
}

console.log("\n恢复完成。");
console.log(
  "提示：auth.users 不在快照内，登录账号需另行恢复；" +
    "恢复后请核对 members 余额与 appointments 数量是否符合预期。"
);
