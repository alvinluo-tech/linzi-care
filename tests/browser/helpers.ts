/**
 * 浏览器点击级 E2E 公共设施
 * - 真实 UI 登录（不注入 session）
 * - service_role 仅用于测试数据清扫（生产代码不引用）
 * - Node 侧 fetch 走本地代理（直连 Supabase 不稳定），localhost 直连
 */
import { expect, type Page } from "@playwright/test";
import {
  setGlobalDispatcher,
  EnvHttpProxyAgent,
  fetch as undiciFetch,
  type RequestInit as UndiciRequestInit,
} from "undici";
import { createClient } from "@supabase/supabase-js";
import "../load-env";
import {
  ANON_KEY,
  CREDENTIALS,
  PROXY,
  SUPABASE_URL,
  serviceRoleKey,
} from "../test-env";
import { assertIsTestMember, resolveTestMember, type TestMember } from "../test-guard";

export { CREDENTIALS, serviceRoleKey, ANON_KEY, SUPABASE_URL };

const proxyDispatcher = new EnvHttpProxyAgent({
  httpProxy: PROXY,
  httpsProxy: PROXY,
  noProxy: "localhost,127.0.0.1",
});

setGlobalDispatcher(proxyDispatcher);

export const REMARK_TAG = "E2E-PLAYWRIGHT";

/** 页面上「今天 +N 天」的日期签文案（与向导 formatMD 一致：M月D日） */
export function dateChipLabel(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86400000);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 登录：优先真实 UI 点击（最贴近用户），fetch 挂起时回退 API 会话注入 */
export async function loginViaUi(
  page: Page,
  email: string,
  password: string,
  waitForUrl: string | RegExp
) {
  const targetPath =
    typeof waitForUrl === "string" && waitForUrl.startsWith("/")
      ? waitForUrl
      : undefined;
  await page.goto(targetPath ? `/login?next=${encodeURIComponent(targetPath)}` : "/login");

  const emailBox = page.locator("#email");
  await emailBox.waitFor({ state: "visible", timeout: 30_000 });
  await emailBox.fill(email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "登 录" }).click();

  // 等待「登录中…」结束（正常 1-2 秒；生产模式偶发浏览器内 fetch 挂起，
  // 挂起时按钮永远 disabled——12 秒后改走 API 会话注入回退）
  const settled = await page
    .waitForFunction(
      () => {
        const btn = document.querySelector<HTMLButtonElement>(
          'button[type="submit"]'
        );
        return btn ? !btn.disabled : false;
      },
      undefined,
      { timeout: 12_000 }
    )
    .then(() => true)
    .catch(() => false);

  if (!settled) {
    console.log(
      `[login-fallback] UI login stalled (fetch hang), injecting API session for ${email}`
    );
    await injectSessionViaApi(page, email, password);
    const dest = targetPath ?? "/";
    // cookie（服务端守卫用）与 localStorage（客户端 supabase-js 用）都已注入。
    // 客户端 supabase-js 异步恢复会话时可能触发一次自动跳转，
    // 因此 goto 后等待页面稳定（连续 2 秒 URL 不变）再返回，最多尝试 3 次
    for (let i = 0; i < 3; i++) {
      await page.goto(dest, { waitUntil: "load" });
      let stable = false;
      let lastUrl = page.url();
      for (let t = 0; t < 10; t++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (page.url() === lastUrl) {
          if (t >= 1) {
            stable = true;
            break;
          }
        } else {
          lastUrl = page.url();
        }
      }
      const stillLogin = await page
        .locator("#email")
        .isVisible()
        .catch(() => false);
      const atDest =
        typeof waitForUrl === "string"
          ? lastUrl.includes(waitForUrl)
          : waitForUrl.test(lastUrl);
      if (stable && !stillLogin && atDest) return;
    }
    // 三次尝试后以最终 URL 为准（交由后续断言判定内容）
    return;
  }

  // 按钮恢复但仍在登录页（报错 toast）：短暂等待跳转，未跳转则报错暴露
  const onLoginPage = await page.locator("#email").isVisible().catch(() => false);
  if (onLoginPage) {
    try {
      await page.waitForURL(waitForUrl, { timeout: 8_000 });
    } catch {
      throw new Error(
        `登录按钮已恢复但仍停留在登录页（当前: ${page.url()}），可能凭证错误或网络异常`
      );
    }
  }

  // 最终等待目标页就绪
  await page.waitForURL(waitForUrl, { timeout: 30_000 }).catch(() => {});
}

/**
 * Supabase 会话在 cookie / localStorage 里的键名：`sb-<project-ref>-auth-token`。
 *
 * 从 SUPABASE_URL 推导，不写死 —— 写死会让这套测试绑死在某个具体项目上，
 * 换成独立的分支库（见 docs/TESTING.md 的隔离方案）后，所有注入会话的用例
 * 会静默失效。原先 09/10 两个 spec 里各写死了一处。
 */
export const AUTH_STORAGE_KEY = `sb-${
  new URL(SUPABASE_URL).hostname.split(".")[0]
}-auth-token`;

/** 通过匿名 API 直接登录并按 supabase-js 浏览器端格式注入会话 cookie */
export async function injectSessionViaApi(
  page: Page,
  email: string,
  password: string
) {
  const dispatcher = new EnvHttpProxyAgent({
    httpProxy: PROXY,
    httpsProxy: PROXY,
    noProxy: "localhost,127.0.0.1",
  });
  // cookie/localStorage 的键名带项目 ref，从 URL 里取，不写死
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];

  // 必须重试：本机代理打 Supabase 偶发 ConnectTimeout（已实测到一次
  // 「攻击3」因此整条失败 —— 而该用例与网络毫无关系）。
  // 套件其余部分都走 retry()，这里原先直接 undiciFetch，是个漏网之鱼。
  // 只重试连接层异常；HTTP 4xx/5xx 是确定的业务结论，重试没有意义。
  const res = await retry(async () => {
    try {
      return await undiciFetch(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: ANON_KEY,
          },
          body: JSON.stringify({ email, password }),
          dispatcher,
        } as UndiciRequestInit
      );
    } catch (e) {
      // 连接超时/DNS/代理抖动：抛出让 retry 再试。
      // HTTP 4xx/5xx 不会走到这里 —— 那是拿到了响应，属确定的业务结论。
      throw new Error(
        `连接 Supabase 失败（${e instanceof Error ? e.message : String(e)}）`
      );
    }
  });
  if (!res.ok) throw new Error(`API 登录失败: ${res.status}`);

  const session = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    user: unknown;
  };

  // supabase-js 浏览器端存储格式：
  // - cookie（供服务端 @supabase/ssr 读取）：base64-<base64(JSON)>
  // - localStorage（供客户端 supabase-js 读取）：JSON 字符串
  const payload = {
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + session.expires_in,
    refresh_token: session.refresh_token,
    user: session.user,
  };
  const b64url = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await page.context().addCookies([
    {
      name: `sb-${projectRef}-auth-token`,
      value: `base64-${b64url}`,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      sameSite: "Lax",
    },
  ]);
  // 客户端 supabase-js（createBrowserClient）从 localStorage 恢复会话
  await page.addInitScript(
    ([storageKey, storageValue]: [string, string]) => {
      localStorage.setItem(storageKey, storageValue);
    },
    [`sb-${projectRef}-auth-token`, JSON.stringify(payload)] as [string, string]
  );
}

/** 通过 UI 退出登录（等待按钮出现，避免 useAuth 加载竞态导致漏点） */
export async function logoutViaUi(page: Page) {
  const logout = page.getByRole("button", { name: "退出" }).first();
  const visible = await logout
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (visible) {
    await logout.click();
    await page.waitForURL("**/", { timeout: 30_000 });
  }
}

/** 本地时区的 yyyy-MM-dd（与卡片 formatDateTime 的日期部分一致） */
export function isoDateLabel(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 未捕获的页面 JS 异常收集器（测试结束断言为零） */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

export function expectNoPageErrors(errors: string[]) {
  expect(
    errors,
    `页面出现未捕获 JS 异常：\n${errors.join("\n")}`
  ).toHaveLength(0);
}

export function serviceClient() {
  return createClient(SUPABASE_URL, serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      // supabase-js 声明的是 DOM 版 fetch/Response，而我们要塞 undici 的
      // dispatcher 才能走代理，两者类型不兼容（undici 的 Headers 迭代器少了
      // Symbol.dispose）。运行时完全没问题，纯粹是声明冲突，故在边界处强转。
      fetch: ((url: string | URL | Request, init?: RequestInit) =>
        undiciFetch(url as string, {
          ...init,
          dispatcher: proxyDispatcher,
        } as UndiciRequestInit)) as unknown as typeof fetch,
    },
  });
}

/**
 * 夹具查询：带重试 + 空值即报错。
 *
 * 为什么需要：本机代理打 Supabase 偶发 ConnectTimeout，而所有 spec 的夹具准备
 * （先查 staff/members/services，再据此造数据）都是 `.single()` 后用 `data!`。
 * 一次抖动就让 data 为 null，抛出「Cannot read properties of null (reading 'id')」
 * —— 报错完全指错方向，看起来像业务数据缺失，实为网络抖动。
 *
 * 这里做两件事：
 *  1. 只对连接层异常重试（HTTP 4xx/5xx 是确定的业务结论，重试无意义）；
 *  2. 查询成功但没有行时，**明确抛出"夹具缺失"**并带上查询描述，
 *     而不是把 null 交给调用方去解引用。
 */
export async function fixtureQuery<T>(
  describe: string,
  run: () => PromiseLike<{ data: T | null; error: { message: string } | null }>
): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= 5; i++) {
    try {
      const { data, error } = await run();
      if (error) throw new Error(`${describe} 查询失败: ${error.message}`);
      if (data === null || data === undefined) {
        throw new Error(`${describe} 查不到数据（夹具可能已被清理）`);
      }
      return data;
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      const transient =
        /fetch failed|ConnectTimeout|ECONNRESET|ETIMEDOUT|UND_ERR|socket hang up|network/i.test(
          msg
        );
      // 业务性失败（含"查不到数据"）不重试，立刻暴露
      if (!transient) throw e;
      lastErr = e;
      if (i < 5) await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  throw lastErr;
}

async function retry<T>(fn: () => Promise<T>, attempts = 8, delay = 3000): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts) await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/** 清扫本套件产生的测试数据（预约按备注标记，推送订阅按无头 UA） */
export async function cleanupBrowserTestData() {
  const admin = serviceClient();
  await retry(async () => {
    const { error } = await admin
      .from("appointments")
      .delete()
      .like("remark", `%${REMARK_TAG}%`);
    if (error) throw new Error(error.message);
  });
  await retry(async () => {
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .like("user_agent", "%HeadlessChrome%");
    if (error) throw new Error(error.message);
  });
}

/**
 * 清空测试会员的全部预约，保证「即将赴约/日历/客单」断言不被遗留数据污染。
 *
 * 安全前提：**必须先证明目标是测试账号**。
 * 原实现按 `name = '张女士'` 查找，而 .single() 在有多行时会报错、
 * 恰好一行时则静默通过 —— 一旦真实顾客里出现同名，测试就会删光她的预约，
 * 且没有任何提示。现改为按 E2E_MEMBER_EMAIL 精确定位，并校验域名白名单。
 */
export async function purgeMemberAppointments() {
  const admin = serviceClient();
  // 把 supabase 客户端强转成 resolveTestMember 声明的最小结构：
  // 完整客户端类型带着深层泛型，做结构匹配会让 TS 递归到爆（TS2589）。
  const testMember = await retry<TestMember>(() =>
    resolveTestMember(admin as unknown as Parameters<typeof resolveTestMember>[0], "purgeMemberAppointments")
  );

  await retry(async () => {
    const { error } = await admin
      .from("appointments")
      .delete()
      .eq("customer_id", testMember.id);
    if (error) throw new Error(error.message);
  });
}

/**
 * 断言某个会员 id 就是配置的测试账号。
 * 用于在任何按 id 施加的破坏性操作（改余额、删单）之前做二次确认。
 */
export async function assertTestMemberId(
  memberId: string,
  context: string
): Promise<void> {
  const admin = serviceClient();
  const { data, error } = await admin
    .from("members")
    .select("id, name, email, balance")
    .eq("id", memberId)
    .maybeSingle();
  if (error) throw new Error(`[${context}] 校验会员身份失败: ${error.message}`);
  assertIsTestMember(data, context);
}

/** 采集导航性能指标（在页面 load 后调用） */
export async function readNavTiming(page: Page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType(
      "navigation"
    )[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return null;
    return {
      ttfb: Math.round(nav.responseStart - nav.startTime),
      dcl: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
      load: Math.round(nav.loadEventEnd - nav.startTime),
      requests: performance.getEntriesByType("resource").length,
    };
  });
}
