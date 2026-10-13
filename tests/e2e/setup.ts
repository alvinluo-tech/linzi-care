/**
 * E2E 测试基础设施
 * 遵循 typescript-e2e-testing 技能规范：
 * - 真实基础设施（远程 Supabase + 本地 dev server），不 mock 数据库
 * - GWT（Given-When-Then）模式
 * - 顺序执行、测试隔离、测试后清理
 */
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "../load-env";

// 凭据一律来自环境变量（见 tests/test-env.ts）。此前硬编码在这里的
// anon key 与三套账号口令已移除：口令轮换不该需要改代码，密钥更不该入库。
export { SUPABASE_URL, ANON_KEY, SITE, CREDENTIALS } from "../test-env";
import { ANON_KEY, CREDENTIALS, SITE, SUPABASE_URL, PROXY } from "../test-env";

export const E2E_TAG = "E2E-TEST";

// 网络出口：本机直连 Supabase 常被阻断，默认走本地代理（Clash 等监听 7897）。
// 可用 E2E_PROXY=direct 强制直连，或 E2E_PROXY=http://host:port 指定其他代理。
// localhost/127.0.0.1 一律直连，避免本机 dev server 请求被代理劫持（502）。
if (PROXY !== "direct") {
  setGlobalDispatcher(
    new EnvHttpProxyAgent({
      httpProxy: PROXY,
      httpsProxy: PROXY,
      noProxy: "localhost,127.0.0.1",
    })
  );
}

export function makeClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * 执行一条 PostgREST 查询：结果级错误转为异常。
 * 关键点：supabase-js 查询失败（含网络错误）不会抛出，而是放进 error 字段；
 * 必须转成异常，retry 才能真正重试瞬时网络抖动。
 */
export async function q<T = any>(
  builder: PromiseLike<{ data: T; error: { message: string } | null }>
): Promise<T> {
  const res = await builder;
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** 网络重试（远程 Supabase 偶发抖动；配合 q() 使用才有效） */
export async function retry<T>(
  fn: () => Promise<T>,
  attempts = 8,
  delay = 2000
): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/** 登录并返回携带会话的客户端 */
export async function login(
  email: string,
  password: string
): Promise<SupabaseClient> {
  return retry(async () => {
    const c = makeClient();
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`登录失败(${email}): ${error.message}`);
    return c;
  });
}

/** 轮询等待异步副作用落库（如 Webhook 触发的通知） */
export async function waitFor<T>(
  fn: () => Promise<T | null>,
  timeoutMs = 30000,
  intervalMs = 2000
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result !== null) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

// ---------- GWT 极简运行器 ----------

export interface TestCase {
  name: string;
  run: () => Promise<void>;
}

export interface TestSuite {
  name: string;
  tests: TestCase[];
}

export function suite(name: string, tests: TestCase[]): TestSuite {
  return { name, tests };
}

/** 断言：不满足即抛出带上下文的错误 */
export function expect(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

/** 跨套件共享的上下文（按顺序执行，前序套件产出供后续使用） */
export const ctx: Record<string, any> = {};

export async function runAll(suites: TestSuite[]): Promise<boolean> {
  let pass = 0;
  let fail = 0;
  const failures: { suite: string; name: string; error: string }[] = [];

  for (const s of suites) {
    console.log(`\n━━━ ${s.name} ━━━`);
    for (const t of s.tests) {
      try {
        await t.run();
        pass++;
        console.log(`  ✓ ${t.name}`);
      } catch (e) {
        fail++;
        const msg = e instanceof Error ? e.message : String(e);
        failures.push({ suite: s.name, name: t.name, error: msg });
        console.log(`  ✗ ${t.name}\n      ↳ ${msg}`);
      }
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`结果：${pass} 通过 / ${fail} 失败（共 ${pass + fail} 项）`);
  if (failures.length > 0) {
    console.log(`\n失败明细：`);
    for (const f of failures) {
      console.log(`  [${f.suite}] ${f.name}`);
      console.log(`    ${f.error}`);
    }
  }
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  return fail === 0;
}
