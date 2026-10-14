/**
 * 推送前密钥扫描
 *
 * 为什么需要它：本项目发生过两次凭据入库 —— 一次是测试夹具里的生产
 * `service_role`，一次是我自己写的「搬运密钥的脚本」把同一个 key 又抄回源码。
 * 两次都靠临时脚本才发现，而临时脚本每次都要重写、还容易漏。
 *
 * 关键设计：**扫描的是 `origin/main..HEAD` 的完整差异，而不是仓库工作区。**
 * 只有进入提交的内容才会被发布；同时必须覆盖「所有待推送的提交」——
 * 我踩过的坑正是只看最后一次推送的 diff，于是早几个提交里的密钥被漏掉，
 * 并据此得出了「没推出去」的错误结论。
 *
 * 用法：
 *   npx tsx scripts/scan-secrets.mts          # 扫待推送提交
 *   npx tsx scripts/scan-secrets.mts --all    # 扫全部历史（慢）
 *
 * 退出码非 0 表示发现可疑值 —— 可直接串进 CI 或 pre-push 钩子。
 */
import { execFileSync } from "node:child_process";

/** 已知的敏感值模式。新增泄漏源时往这里加一行即可。 */
const PATTERNS: { name: string; re: RegExp }[] = [
  {
    name: "JWT（service_role / anon / 其它）",
    // JWT 三段式结构：header.payload.signature
    re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g,
  },
  { name: "Supabase 新式密钥", re: /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{16,}/g },
  { name: "Supabase 项目 ref", re: /\b[a-z]{20}\.supabase\.co\b/g },
  { name: "Resend 密钥", re: /\bre_[A-Za-z0-9_-]{16,}/g },
  { name: "私钥文件头", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  // 下面这些是「形如口令的赋值」，用于抓 .env 内容被误提交的情况
  {
    name: "疑似硬编码口令赋值",
    re: /(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*["'][^"'\s]{8,}["']/gi,
  },
];

function git(args: string[]): string {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    });
  } catch (e) {
    // git 在「无匹配」时退出码非 0，属正常
    const out = (e as { stdout?: string }).stdout;
    if (typeof out === "string") return out;
    throw e;
  }
}

function addedLines(range: string[]): string[] {
  const diff = git(["diff", ...range]);
  return diff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1));
}

/** 已知的安全例外：测试用的假值、文档里的占位符 */
const ALLOWLIST = [
  "placeholder-anon-key",
  "your-anon-key",
  "<anon-public-key>",
  "example.com",
  "linzi.com",
  "sb-<ref>-auth-token",
];

function main() {
  const scanAll = process.argv.includes("--all");
  const range = scanAll ? ["HEAD"] : ["origin/main..HEAD"];

  let target: string;
  try {
    target = scanAll
      ? "全部历史（HEAD）"
      : `待推送提交（${git(["log", "--oneline", ...range]).trim().split("\n").length} 个）`;
  } catch {
    target = "待推送提交";
  }

  const lines = addedLines(range);
  console.log(`扫描范围：${target}`);
  console.log(`新增行数：${lines.length}\n`);

  let total = 0;

  for (const p of PATTERNS) {
    const hits = new Map<string, number>(); // 值 -> 行号
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (ALLOWLIST.some((a) => line.includes(a))) continue;
      const m = line.match(p.re);
      if (m) {
        for (const v of m) {
          if (!hits.has(v)) hits.set(v, i + 1);
        }
      }
    }

    if (hits.size === 0) {
      console.log(`✓ ${p.name}`);
      continue;
    }

    total += hits.size;
    console.log(`✗ ${p.name}：${hits.size} 处`);
    for (const [v, ln] of [...hits].slice(0, 5)) {
      // 只显示头尾，避免把密钥完整打印到日志里
      const masked =
        v.length > 20 ? `${v.slice(0, 8)}…${v.slice(-6)}` : v;
      console.log(`    第 ${ln} 行  ${masked}`);
    }
    if (hits.size > 5) console.log(`    …另有 ${hits.size - 5} 处`);
  }

  console.log("");
  if (total === 0) {
    console.log("结论：未发现可疑密钥，可以推送。");
  } else {
    console.log(`结论：发现 ${total} 处可疑值，请确认后再推送。`);
    console.log(
      "\n提醒：密钥一旦进入提交历史，删除文件也无效 —— 只能轮换作废。"
    );
  }
  process.exit(total === 0 ? 0 : 1);
}

main();
