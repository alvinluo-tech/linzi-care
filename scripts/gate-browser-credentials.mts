/**
 * 入库前的硬门槛：逐个扫描 tests/browser/ 下所有文件是否含真实凭据。
 * 只有在确认无密钥后才允许删掉 .gitignore 里的 /tests/browser/。
 * 用法：npx tsx scripts/gate-browser-credentials.mts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIR = "tests/browser";

// 与 scripts/scan-secrets.mts 同源的判定模式
const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "JWT（Supabase anon/service key）", re: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
  { name: "sb_secret_ 前缀新密钥", re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "Supabase 项目 ref", re: /bzjsbiafxxgljbdcreqf/ },
  { name: "Resend 密钥", re: /re_[A-Za-z0-9]{20,}/ },
  { name: "私钥头", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "硬编码密码赋值", re: /(password|passwd|pwd)\s*[:=]\s*["'][^"'{}$][^"']{5,}["']/i },
  { name: "手机号（真实客户）", re: /1[3-9]\d{9}/ },
  { name: "非占位邮箱", re: /[a-z0-9._%+-]+@(?!linzi\.com|example\.com|supabase\.co|placeholder)[a-z0-9.-]+\.[a-z]{2,}/i },
];

// 允许出现的占位/测试值
const ALLOW: RegExp[] = [
  /placeholder/i,
  /your-.*-here/i,
  /<[A-Z_]+>/,
  /process\.env\./,
  /\$\{/,
  /loadEnv/,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

let hits = 0;
const files = walk(DIR);
console.log(`扫描 ${files.length} 个文件...\n`);

for (const f of files) {
  const text = readFileSync(f, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (ALLOW.some((a) => a.test(line))) return;
    for (const p of PATTERNS) {
      if (p.re.test(line)) {
        hits++;
        console.log(`❌ ${f}:${i + 1}`);
        console.log(`   规则: ${p.name}`);
        console.log(`   内容: ${line.trim().slice(0, 110)}`);
      }
    }
  });
}

console.log(`\n${hits === 0 ? "✅ 未发现凭据，可以入库" : `❌ 发现 ${hits} 处可疑内容，不得入库`}`);
process.exit(hits === 0 ? 0 : 1);
