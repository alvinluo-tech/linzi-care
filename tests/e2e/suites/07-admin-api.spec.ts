/**
 * 管理端取数身份隔离（API 层验收）
 *
 * 修复背景：管理端页面原先在浏览器里用当前 cookie 会话直连取数。共用设备上
 * 若残留员工/顾客会话，`appointments` 行仍可读（策略允许 staff 读自己的单），
 * 但其内嵌的 `members` 关联会被 members 表 RLS 静默过滤成 null，
 * 前端 `?? "匿名客户"` 兜底随即把「读不到客户」显示成「匿名客户」。
 *
 * 修复：管理端读操作统一走 /api/admin/*，服务端先核验 admin 身份再取数；
 * 非 admin 明文拒绝。
 */
import { suite, expect, retry, CREDENTIALS, SITE } from "../setup";
import { ANON_KEY, SUPABASE_URL } from "../../test-env";

/** 用指定账号的会话访问本地管理端接口（cookie 形式，与浏览器一致） */
async function adminApiAs(
  path: string,
  email: string,
  password: string
): Promise<{ status: number; body: any; cookie: string }> {
  const bundle = await loginBundle(email, password);
  return {
    cookie: bundle.cookie,
    ...(await callAdminApi(path, bundle.cookie)),
  };
}

/** 请求本地管理端接口：可选传入 supabase 会话 cookie */
async function callAdminApi(
  path: string,
  cookie?: string
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${SITE}/api/admin${path}`, {
    headers: { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) },
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/**
 * 登录并组装 @supabase/ssr 浏览器端使用的会话 cookie：
 * 值形如 `base64-<base64url(JSON)>`，cookie 名 `sb-<project-ref>-auth-token`。
 */
async function loginBundle(
  email: string,
  password: string
): Promise<{ token: string; cookie: string }> {
  // 必须带重试：本机到 Supabase 要走代理，单发请求偶发失败会返回非 JSON 或
  // 缺失 access_token；那样拼出的 cookie 里 user 为 undefined，服务端
  // requireAdmin() 的 getUser() 会判为未登录，测试却报「老板应被放行，实际 401」，
  // 把网络抖动伪装成权限回归。setup.ts 的 login() 同样走 retry()。
  const json = await retry(async () => {
    const r = await fetch(
      "https://bzjsbiafxxgljbdcreqf.supabase.co/auth/v1/token?grant_type=password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey:
            ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
      }
    );
    const body = (await r.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      user?: unknown;
    };
    // 没有 token 就当作瞬时失败重试，而不是带着坏 cookie 继续跑
    if (!body.access_token) {
      throw new Error(
        `${email} 换取会话失败（HTTP ${r.status}）：${JSON.stringify(body).slice(0, 200)}`
      );
    }
    return body;
  }, 5, 1500);

  const payload = {
    access_token: json.access_token,
    token_type: json.token_type,
    expires_in: json.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600),
    refresh_token: json.refresh_token,
    user: json.user,
  };
  const b64url = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return {
    token: json.access_token!,
    cookie: `sb-bzjsbiafxxgljbdcreqf-auth-token=base64-${b64url}`,
  };
}

export const adminApiSuite = suite("管理端接口身份隔离（API 层）", [
  {
    name: "GIVEN 老板会话 WHEN 请求 /api/admin/appointments THEN 200 且客户名非空（防匿名客户）",
    run: async () => {
      const { status, body } = await adminApiAs(
        "/appointments",
        CREDENTIALS.boss.email,
        CREDENTIALS.boss.password
      );
      expect(status === 200, `老板应被放行，实际 ${status}：${JSON.stringify(body)}`);
      expect(Array.isArray(body.appointments), "应返回 appointments 数组");
      // 每一行都不得出现 members 为 null —— 那正是「匿名客户」的直接成因
      const nullMemberRows = body.appointments.filter(
        (a: any) => a.members === null || a.members === undefined
      );
      expect(
        nullMemberRows.length === 0,
        `老板视角下 ${nullMemberRows.length} 笔预约的客户关联为空，UI 会显示匿名客户`
      );
      for (const a of body.appointments) {
        expect(
          typeof a.members?.name === "string" && a.members.name.length > 0,
          `预约 ${a.id} 的客户名为空：${JSON.stringify(a.members)}`
        );
      }
    },
  },
  {
    name: "GIVEN 员工会话 WHEN 请求 /api/admin/appointments THEN 拒绝且不返回任何预约数据",
    run: async () => {
      const { status, body } = await adminApiAs(
        "/appointments",
        CREDENTIALS.staff.email,
        CREDENTIALS.staff.password
      );
      expect(
        status === 401 || status === 403,
        `员工必须被拒绝，实际 ${status}：${JSON.stringify(body)}`
      );
      expect(body.appointments === undefined, "被拒时不得返回 appointments 字段");
      expect(typeof body.error === "string" && body.error.length > 0, "应给出明确原因");
    },
  },
  {
    name: "GIVEN 会员会话 WHEN 请求 /api/admin/* THEN 一律拒绝（含 pending-count 与 dashboard）",
    run: async () => {
      for (const path of [
        "/appointments",
        "/pending-count",
        "/members",
        "/staff",
        "/dashboard?day_start=2026-10-12T16:00:00.000Z&day_end=2026-10-13T16:00:00.000Z&month_start=2026-09-30T16:00:00.000Z",
      ]) {
        const { status, body } = await adminApiAs(
          path,
          CREDENTIALS.member.email,
          CREDENTIALS.member.password
        );
        expect(
          status === 401 || status === 403,
          `会员请求 ${path} 必须被拒，实际 ${status}`
        );
        expect(body.error !== undefined, `${path} 被拒时应带 error 说明`);
      }
    },
  },
  {
    name: "GIVEN 无会话 WHEN 请求 /api/admin/appointments THEN 拒绝（401）",
    run: async () => {
      const { status, body } = await callAdminApi("/appointments");
      expect(status === 401 || status === 403, `无会话应被拒，实际 ${status}`);
      expect(body.error !== undefined, "无会话应带 error 说明");
    },
  },
  {
    name: "GIVEN 老板会话 WHEN 请求 /api/admin/members THEN 余额字段可读（管理端数据完整性）",
    run: async () => {
      const { status, body } = await adminApiAs(
        "/members",
        CREDENTIALS.boss.email,
        CREDENTIALS.boss.password
      );
      expect(status === 200, `老板应能读会员，实际 ${status}`);
      expect(Array.isArray(body.members), "应返回 members 数组");
      const withBalance = body.members.filter((m: any) => typeof m.balance === "number");
      expect(
        withBalance.length === body.members.length,
        "管理端会员列表必须包含余额（余额是服务端权威字段）"
      );
    },
  },
]);

/** 保持 setup.ts 的 imports 被用到：类型层面确认客户端可构造 */
