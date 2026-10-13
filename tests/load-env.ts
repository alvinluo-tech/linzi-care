/**
 * 极简 .env 载入器（零依赖）
 *
 * 为什么不装 dotenv：只需要读一个文件、只服务测试，为此增加一个运行期依赖
 * 不划算；而且 Next.js 自己会读 .env.local，这里只是让 Node 侧的测试脚本
 * 也能拿到同一份配置，避免出现两套真相。
 *
 * 行为约定：
 *   - 已存在的 process.env 优先（命令行注入 > 文件），方便临时覆盖；
 *   - 不覆盖 NODE_ENV，避免把 test 意外改成别的值；
 *   - 解析 `KEY=value`，支持引号包裹与 # 注释，不做变量插值（够用即可）。
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parse(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    // 去掉包裹引号；未加引号时去掉行尾注释
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash).trim();
    }

    if (key) out[key] = value;
  }
  return out;
}

/** 载入项目根目录下的环境文件（.env.local 优先于 .env） */
export function loadEnv(cwd = process.cwd()): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(cwd, file);
    if (!existsSync(path)) continue;

    const parsed = parse(readFileSync(path, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      // 已注入的环境变量优先，方便 CI 覆盖文件内容
      if (process.env[key] === undefined && key !== "NODE_ENV") {
        process.env[key] = value;
      }
    }
  }
}
