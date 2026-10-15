/**
 * 数据库备份 —— 把全部业务表导出成可读的 JSON 快照。
 *
 * 为什么自己写而不是只依赖 Supabase 自带备份：
 *
 *  1. **免费版没有可恢复的自动备份**。Supabase 的 PITR（时间点恢复）是付费
 *     功能，免费项目只有平台侧的物理备份，用户拿不到、也没法自助恢复。
 *     换句话说，「靠平台备份」在当前套餐下等于没有备份。
 *
 *  2. **导出物是自解释的**。JSON 快照用文本编辑器就能看，出事后能直接确认
 *     「这条预约还在不在」，不必先把整个库恢复起来才知道。
 *
 *  3. **可离线留存**。文件落到本地/网盘即可，不依赖任何服务在线。
 *
 * 本脚本导出**全表数据**（不含 auth.users —— 那是 Supabase 托管表，
 * 口令哈希不在我们的掌控范围内，单独在 docs 里说明处理办法）。
 *
 * 用法：
 *   npx tsx scripts/db-backup.mts                      # 备份到 backups/
 *   npx tsx scripts/db-backup.mts --out D:\somewhere   # 指定目录
 *   npx tsx scripts/db-backup.mts --verify backups/xxx # 校验快照完整性
 *   npx tsx scripts/db-backup.mts --keep 30            # 只保留最近 30 份
 *
 * 注意：导出物含会员手机号等个人信息，**绝不可提交进仓库**。
 * backups/ 已在 .gitignore 里排除。
 */
import fs from "node:fs";
import path from "node:path";
import { fetch as uf, EnvHttpProxyAgent } from "undici";
import { loadEnv } from "../tests/load-env";

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY。\n" +
      "备份需要 service_role（要读全部表、绕过 RLS），请在 .env.local 中配置。"
  );
  process.exit(1);
}

const proxy = process.env.E2E_PROXY ?? "http://127.0.0.1:7897";
const dispatcher = new EnvHttpProxyAgent({
  httpProxy: proxy,
  httpsProxy: proxy,
  noProxy: "localhost,127.0.0.1",
});

/**
 * 备份顺序即依赖顺序：被引用的表在前。
 * 恢复时按同一顺序插入，避免外键报错。
 */
const TABLES = [
  "stores",
  "product_categories",
  "products",
  "service_passes",
  "services",
  "staff",
  "staff_services",
  "members",
  "profiles",
  "user_roles",
  "appointments",
  "balance_logs",
  "pass_ledger",
  "schedules",
  "notifications",
  "reminders",
  "push_subscriptions",
] as const;

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  Accept: "application/json",
};

/** 单页条数。PostgREST 默认上限 1000，取 1000 正好一页一表。 */
const PAGE = 1000;

async function fetchAll(table: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=${PAGE}&offset=${offset}`;
    const res = await uf(url, { headers: HEADERS, dispatcher });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`导出 ${table} 失败：HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    const page = (await res.json()) as unknown[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

/** 从 OpenAPI 描述里取表的列名 —— 恢复时需要知道列顺序 */
async function fetchColumns(): Promise<Record<string, string[]>> {
  const res = await uf(`${SUPABASE_URL}/rest/v1/`, {
    headers: HEADERS,
    dispatcher,
  });
  if (!res.ok) throw new Error(`读取表结构失败：HTTP ${res.status}`);
  const spec = (await res.json()) as {
    definitions?: Record<string, { properties?: Record<string, unknown> }>;
  };
  const out: Record<string, string[]> = {};
  for (const [table, def] of Object.entries(spec.definitions ?? {})) {
    out[table] = Object.keys(def.properties ?? {});
  }
  return out;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function backup() {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const outRoot = arg("--out") ?? path.join(process.cwd(), "backups");
  const dir = path.join(outRoot, `linzi-care_${stamp}`);
  fs.mkdirSync(dir, { recursive: true });

  console.log(`备份目标：${dir}\n`);
  console.log("表".padEnd(24) + "行数");
  console.log("-".repeat(34));

  const columns = await fetchColumns();
  const manifest: Record<string, { rows: number; bytes: number; columns: string[] }> = {};
  let grandTotal = 0;

  for (const table of TABLES) {
    const rows = await fetchAll(table);
    const file = path.join(dir, `${table}.json`);
    fs.writeFileSync(file, JSON.stringify(rows, null, 2), "utf8");
    const bytes = fs.statSync(file).size;
    manifest[table] = { rows: rows.length, bytes, columns: columns[table] ?? [] };
    grandTotal += rows.length;
    console.log(table.padEnd(24) + String(rows.length).padStart(6));
  }

  console.log("-".repeat(34));
  console.log("合计".padEnd(22) + String(grandTotal).padStart(6));

  const meta = {
    project: SUPABASE_URL,
    takenAt: new Date().toISOString(),
    totalRows: grandTotal,
    /** 表顺序即恢复顺序（被引用者在前） */
    order: TABLES,
    tables: manifest,
    note:
      "不含 auth.users（Supabase 托管）。恢复该表需另见 docs/BACKUP.md。" +
      "本文件含个人信息，请勿提交到版本库。",
  };
  fs.writeFileSync(path.join(dir, "_manifest.json"), JSON.stringify(meta, null, 2), "utf8");

  console.log(`\n完成。清单：${path.join(dir, "_manifest.json")}`);

  const keep = Number(arg("--keep") ?? 0);
  if (keep > 0) prune(outRoot, keep);
}

/** 只保留最近 N 份快照，避免备份目录无限膨胀 */
function prune(outRoot: string, keep: number) {
  if (!fs.existsSync(outRoot)) return;
  const snaps = fs
    .readdirSync(outRoot)
    .filter((n) => n.startsWith("linzi-care_"))
    .sort()
    .reverse();
  for (const old of snaps.slice(keep)) {
    fs.rmSync(path.join(outRoot, old), { recursive: true, force: true });
    console.log(`已清理旧快照：${old}`);
  }
}

/** 校验一份快照：清单里的行数与实际文件内容是否一致 */
function verify(dir: string) {
  const metaPath = path.join(dir, "_manifest.json");
  if (!fs.existsSync(metaPath)) {
    console.error(`找不到 ${metaPath}`);
    process.exit(1);
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
    takenAt: string;
    totalRows: number;
    tables: Record<string, { rows: number }>;
  };

  console.log(`快照时间：${meta.takenAt}`);
  console.log(`清单声明总行数：${meta.totalRows}\n`);

  let bad = 0;
  let actual = 0;
  for (const [table, info] of Object.entries(meta.tables)) {
    const f = path.join(dir, `${table}.json`);
    if (!fs.existsSync(f)) {
      console.log(`  ✗ ${table} 文件缺失`);
      bad++;
      continue;
    }
    let rows: unknown[];
    try {
      rows = JSON.parse(fs.readFileSync(f, "utf8")) as unknown[];
    } catch {
      console.log(`  ✗ ${table} JSON 解析失败（文件可能损坏）`);
      bad++;
      continue;
    }
    actual += rows.length;
    if (rows.length !== info.rows) {
      console.log(`  ✗ ${table} 行数不符：清单 ${info.rows}，实际 ${rows.length}`);
      bad++;
    }
  }

  console.log(`实际总行数：${actual}`);
  if (bad) {
    console.log(`\n校验失败：${bad} 个表有问题`);
    process.exit(1);
  }
  console.log("\n校验通过：所有表文件齐全、行数与清单一致。");
}

const verifyDir = arg("--verify");
if (verifyDir) {
  verify(verifyDir);
} else {
  await backup();
}
