import { test, expect } from "@playwright/test";
import {
  AUTH_STORAGE_KEY,
  CREDENTIALS,
  fixtureQuery,
  loginViaUi,
  serviceClient,
} from "../browser/helpers";
import { ANON_KEY, SUPABASE_URL } from "../test-env";

/**
 * 员工客单卡上的时间标签格式（与 src/lib/format.ts 的 formatTime 一致：
 * 以东八区渲染，小时不补零）。测试里本地复刻，避免 import 前端模块。
 */
function formatTimeForLabel(iso: string): string {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${get("hour").padStart(2, "0")}:${get("minute")}`;
}

/**
 * 对抗性验收 · 第二轮：攻击自己的修复
 *
 * 攻击面清单：
 *  1. 员工能否绕过 /api/admin/* 直接改库（写路径是否仍受保护）
 *  2. 老板在「同一浏览器」先登录员工、再登录老板 —— 会话是否正确切换
 *     （这正是用户现场：共用设备）
 *  3. 员工「完成服务」后，老板日历是否仍显示真实姓名（用户报告的确切时序）
 *  4. 伪造/畸形 cookie 是否会误判为 admin
 */
test.describe("对抗性：攻击管理端身份隔离", () => {
  const tag = "ADVERSARY";
  let apptId = "";

  test.beforeAll(async () => {
    const admin = serviceClient();
    // 先清掉可能残留的同标记数据，再查该技师的已占时段，
    // 选一个真空闲时段 —— 直接用固定 16:30 会撞 appointments_staff_start_active_idx
    await admin.from("appointments").delete().like("remark", `%${tag}%`);

    const member = await fixtureQuery("测试会员「张女士」", () =>
      admin.from("members").select("id").eq("name", "张女士").single()
    );
    const staff = await fixtureQuery("测试技师「林小梓」", () =>
      admin.from("staff").select("id").eq("name", "林小梓").single()
    );
    const svc = await fixtureQuery("测试项目「姜汤头疗」", () =>
      admin.from("services").select("id, duration").eq("name", "姜汤头疗").single()
    );

    const taken = new Set(
      (
        await admin
          .from("appointments")
          .select("start_time")
          .eq("staff_id", staff.id)
      ).data?.map((r) => r.start_time) ?? []
    );

    // 从明天 20:00 起按半小时回退找一个没人占的时隙
    let slot: Date | null = null;
    const probe = new Date();
    probe.setDate(probe.getDate() + 1);
    probe.setHours(20, 0, 0, 0);
    for (let i = 0; i < 24 && !slot; i++) {
      if (!taken.has(probe.toISOString())) slot = new Date(probe);
      probe.setMinutes(probe.getMinutes() - 30);
    }
    expect(slot, "找不到空闲时段").toBeTruthy();
    const start = slot!;

    const { data, error } = await admin.from("appointments").insert({
      customer_id: member.id, staff_id: staff.id, service_id: svc.id,
      start_time: start.toISOString(),
      end_time: new Date(start.getTime() + (svc.duration ?? 60) * 60000).toISOString(),
      status: "confirmed", remark: tag, charged_amount: 0, payment_state: "legacy",
    }).select("id").single();
    expect(error, error?.message).toBeNull();
    apptId = data!.id;
  });

  test.afterAll(async () => {
    await serviceClient().from("appointments").delete().like("remark", `%${tag}%`);
  });

  test("攻击1：员工不能绕过 API 直接改预约（写路径仍受 RLS 保护）", async ({ page }) => {
    await loginViaUi(page, CREDENTIALS.staff.email, CREDENTIALS.staff.password, "/staff");
    // 模块级常量在浏览器上下文里不存在，必须作为参数传进 page.evaluate
    const jwt = await page.evaluate(
      (key) => {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw).access_token as string) : null;
      },
      AUTH_STORAGE_KEY
    );
    const anonKey = ANON_KEY;

    // 尝试把客户改成另一个会员（越权写）
    const res = await page.evaluate(
      async ({
        jwt,
        anonKey,
        aid,
        base,
      }: {
        jwt: string;
        anonKey: string;
        aid: string;
        base: string;
      }) => {
        const r = await fetch(
          `${base}/rest/v1/appointments?id=eq.${aid}`,
          {
            method: "PATCH",
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${jwt}`,
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify({ customer_id: "00000000-0000-0000-0000-000000000000" }),
          }
        );
        return { status: r.status, body: await r.text() };
      },
      { jwt: jwt!, anonKey, aid: apptId, base: SUPABASE_URL }
    );

    // RLS 的 UPDATE 策略只允许 admin，员工应被拒（0 行受影响或 401/403）
    const affected = (JSON.parse(res.body || "[]") as unknown[]).length;
    expect(
      affected,
      `员工直改预约必须无效，实际返回 ${res.status} / ${res.body}`
    ).toBe(0);
  });

  test("攻击2：同一浏览器先员工后老板登录，老板接口必须按老板身份放行", async ({ page }) => {
    // 先以员工身份登录（模拟共用设备残留）
    await loginViaUi(page, CREDENTIALS.staff.email, CREDENTIALS.staff.password, "/staff");
    let r = await page.request.get("/api/admin/appointments");
    expect(r.status(), "员工态应被拒").toBe(403);

    // 同一浏览器上下文里改登老板
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.context().clearCookies();
    await loginViaUi(page, CREDENTIALS.boss.email, CREDENTIALS.boss.password, "/admin/calendar");
    await expect(page.getByRole("heading", { name: /排班与预约日历/ })).toBeVisible({ timeout: 45_000 });

    r = await page.request.get("/api/admin/appointments");
    expect(r.status(), "老板态应放行").toBe(200);
    const json = (await r.json()) as { appointments: { id: string; members: { name: string } | null }[] };
    const row = json.appointments.find((a) => a.id === apptId);
    expect(row?.members?.name, "改登老板后必须能读出真实客户名").toBe("张女士");
  });

  test("攻击3：员工完成服务后，老板日历仍显示真实姓名（用户报告的确切时序）", async ({ page }) => {
    // 记录本套件 fixture 的起始时刻，用于在员工的「待履约客单」里唯一定位该卡
    const { data: mine } = await serviceClient()
      .from("appointments").select("start_time").eq("id", apptId).single();
    expect(mine, "fixture 预约应存在").toBeTruthy();
    const myTimeLabel = formatTimeForLabel(mine!.start_time);

    // 员工登录并点「完成服务」（按钮在「待履约客单」标签页）
    await loginViaUi(page, CREDENTIALS.staff.email, CREDENTIALS.staff.password, "/staff");
    await page.getByRole("tab", { name: /待履约客单/ }).click();

    // 必须按「起始时间」锁定目标卡：直接 .first() 会点到别的预约，
    // 导致本 fixture 状态没变、后续断言误报。
    const myCard = page
      .locator("div.rounded-xl", { hasText: myTimeLabel })
      .filter({ has: page.getByRole("button", { name: "完成服务" }) })
      .first();
    await expect(myCard, `员工客单里应有时段为 ${myTimeLabel} 的卡`).toBeVisible({ timeout: 30_000 });
    await myCard.getByRole("button", { name: "完成服务" }).click();
    await expect(page.getByText("服务已完成").first()).toBeVisible({ timeout: 20_000 });

    // 校验库内状态确已 done
    const { data: afterDone } = await serviceClient()
      .from("appointments").select("status").eq("id", apptId).single();
    expect(afterDone?.status, "员工打点后状态应为 done").toBe("done");

    // 换老板身份打开日历
    await page.evaluate(() => localStorage.clear());
    await page.context().clearCookies();
    await loginViaUi(page, CREDENTIALS.boss.email, CREDENTIALS.boss.password, "/admin/calendar");
    await expect(page.getByRole("heading", { name: /排班与预约日历/ })).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(6000);

    const bodyText = (await page.locator("body").innerText()) || "";
    expect(bodyText, "老板日历不得出现「匿名客户」").not.toContain("匿名客户");
    const hasName = await page
      .locator(".sx__time-grid-event-title", { hasText: /张女士/ })
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasName, "老板日历应显示真实客户名「张女士」").toBeTruthy();
  });

  test("攻击4：伪造/畸形 cookie 不得被误判为 admin", async ({ page, context }) => {
    // 构造一个看起来像会话、但签名无效的 cookie
    const forged = Buffer.from(
      JSON.stringify({
        access_token: "forged.token.value",
        refresh_token: "forged",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: "00000000-0000-0000-0000-000000000000" },
      })
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    await context.addCookies([
      {
        name: AUTH_STORAGE_KEY,
        value: `base64-${forged}`,
        domain: "localhost",
        path: "/",
        httpOnly: false,
        sameSite: "Lax",
      },
    ]);

    const r = await page.request.get("/api/admin/appointments");
    expect(r.status(), "伪造会话必须被拒").not.toBe(200);
    expect([401, 403, 500, 503]).toContain(r.status());
  });
});
