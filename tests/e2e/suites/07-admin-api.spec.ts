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
import { suite, expect, CREDENTIALS, SITE } from "../setup";
import { makeClient } from "../setup";

/** 用指定账号的 access_token 请求本地管理端接口 */
async function callAdminApi(
  path: string,
  token: string
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${SITE}/api/admin${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function tokenFor(email: string, password: string): Promise<string> {
  const r = await fetch(
    "https://bzjsbiafxxgljbdcreqf.supabase.co/auth/v1/token?grant_type=password",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey:
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6anNiaWFmeHhnbGpiZGNyZXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MTAyNTYsImV4cCI6MjEwNzI4NjI1Nn0.qEUQLQnfxUTjuYKtq8vxkJSmF_5y_6v10m6BF_hfTD0",
      },
      body: JSON.stringify({ email, password }),
    }
  );
  const json = (await r.json()) as { access_token?: string };
  expect(json.access_token, `${email} 登录失败`);
  return json.access_token!;
}

export const adminApiSuite = suite("管理端接口身份隔离（API 层）", [
  {
    name: "GIVEN 老板会话 WHEN 请求 /api/admin/appointments THEN 200 且客户名非空（防匿名客户）",
    run: async () => {
      const token = await tokenFor(CREDENTIALS.boss.email, CREDENTIALS.boss.password);
      const { status, body } = await callAdminApi("/appointments", token);
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
      const token = await tokenFor(CREDENTIALS.staff.email, CREDENTIALS.staff.password);
      const { status, body } = await callAdminApi("/appointments", token);
      expect(
        status === 401 || status === 403,
        `员工必须被拒绝，实际 ${status}：${JSON.stringify(body)}`
      );
      expect(
        body.appointments === undefined,
        "被拒时不得返回 appointments 字段"
      );
      expect(typeof body.error === "string" && body.error.length > 0, "应给出明确原因");
    },
  },
  {
    name: "GIVEN 会员会话 WHEN 请求 /api/admin/* THEN 一律拒绝（含 pending-count 与 dashboard）",
    run: async () => {
      const token = await tokenFor(CREDENTIALS.member.email, CREDENTIALS.member.password);
      for (const path of [
        "/appointments",
        "/pending-count",
        "/members",
        "/staff",
        "/dashboard?day_start=2026-10-12T16:00:00.000Z&day_end=2026-10-13T16:00:00.000Z&month_start=2026-09-30T16:00:00.000Z",
      ]) {
        const { status, body } = await callAdminApi(path, token);
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
      const res = await fetch(`${SITE}/api/admin/appointments`);
      const status = res.status;
      // 注意：测试直接请求本地接口、未带 supabase cookie；无会话必须被拒。
      expect(status === 401 || status === 403, `无会话应被拒，实际 ${status}`);
      expect(res.ok === false, "无会话不得拿到 2xx");
    },
  },
  {
    name: "GIVEN 老板会话 WHEN 请求 /api/admin/members THEN 余额字段可读（管理端数据完整性）",
    run: async () => {
      const token = await tokenFor(CREDENTIALS.boss.email, CREDENTIALS.boss.password);
      const { status, body } = await callAdminApi("/members", token);
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
void makeClient;
