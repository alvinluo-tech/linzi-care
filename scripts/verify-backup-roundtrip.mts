/**
 * 备份/恢复往返测试 —— 证明「备份真的能恢复」。
 *
 * 为什么必须做这件事：未经恢复验证的备份只是「一堆文件」，出事时才发现
 * 恢复不了是最糟的情况。本测试会真的走完整条链路：
 *
 *   1. 导出一份快照 A
 *   2. 清空并回灌（恢复）
 *   3. 再导出一份快照 B
 *   4. 逐表逐字段比对 A 与 B，必须完全一致
 *
 * ⚠️ 会真实清空并重写业务表。**只能在你自己掌控的库上跑**：
 *    - 本地 supabase start 起的库，或
 *    - 明确用于测试的分支库
 * 默认拒绝在疑似生产库上运行；确实要跑请显式加 --force。
 *
 * 用法：npx tsx scripts/verify-backup-roundtrip.mts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const snapA = path.join(root, ".roundtrip", "a");
const snapB = path.join(root, ".roundtrip", "b");

/** 生成列恢复时不写入，比对时忽略 */
const IGNORE_COLUMNS: Record<string, string[]> = { balance_logs: ["delta"] };

function run(args: string[]) {
  return execFileSync("npx", ["tsx", ...args], {
    cwd: root,
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function latestSnapshot(dir: string): string {
  const subs = fs
    .readdirSync(dir)
    .filter((n) => n.startsWith("linzi-care_"))
    .sort();
  if (!subs.length) throw new Error(`${dir} 下没有快照`);
  return path.join(dir, subs.at(-1)!);
}

// 生产库保护
if (!process.argv.includes("--force")) {
  const url = process.env.SUPABASE_URL ?? "";
  if (/bzjsbiafxxgljbdcreqf/.test(url)) {
    console.error(
      "✗ 拒绝执行：当前 SUPABASE_URL 指向生产项目。\n" +
        "  本测试会清空并重写全部业务表。\n" +
        "  请在本地/分支库上运行，或确认无误后加 --force。"
    );
    process.exit(1);
  }
}

fs.rmSync(path.join(root, ".roundtrip"), { recursive: true, force: true });
fs.mkdirSync(snapA, { recursive: true });
fs.mkdirSync(snapB, { recursive: true });

console.log("① 导出快照 A …");
run(["scripts/db-backup.mts", "--out", ".roundtrip/a"]);
const A = latestSnapshot(snapA);

console.log("\n② 恢复（清空并回灌）…");
run(["scripts/db-restore.mts", A, "--apply", "--force"]);

console.log("\n③ 导出快照 B …");
run(["scripts/db-backup.mts", "--out", ".roundtrip/b"]);
const B = latestSnapshot(snapB);

console.log("\n④ 逐表比对 …\n");

const metaA = JSON.parse(fs.readFileSync(path.join(A, "_manifest.json"), "utf8")) as {
  order: string[];
};

let mismatched = 0;
console.log("表".padEnd(22) + "A".padStart(7) + "B".padStart(7) + "  结果");
console.log("-".repeat(50));

for (const t of metaA.order) {
  const a = JSON.parse(fs.readFileSync(path.join(A, `${t}.json`), "utf8")) as Record<string, unknown>[];
  const b = JSON.parse(fs.readFileSync(path.join(B, `${t}.json`), "utf8")) as Record<string, unknown>[];

  const normalize = (rows: Record<string, unknown>[]) =>
    rows
      .map((r) => {
        const o = { ...r };
        for (const k of IGNORE_COLUMNS[t] ?? []) delete o[k];
        return o;
      })
      .sort((x, y) => String(x.id ?? "").localeCompare(String(y.id ?? "")));

  const ok = JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
  if (!ok) mismatched++;
  console.log(
    t.padEnd(22) +
      String(a.length).padStart(7) +
      String(b.length).padStart(7) +
      (ok ? "  ✓" : "  ✗ 不一致")
  );
}

console.log("-".repeat(50));
fs.rmSync(path.join(root, ".roundtrip"), { recursive: true, force: true });

if (mismatched) {
  console.error(`\n✗ 往返失败：${mismatched} 张表数据不一致 —— 备份不可靠，必须排查。`);
  process.exit(1);
}
console.log("\n✓ 往返测试通过：备份与恢复后的数据完全一致。");
