import { test, expect, type Page } from "@playwright/test";
import {
  CREDENTIALS,
  REMARK_TAG,
  cleanupBrowserTestData,
  purgeMemberAppointments,
  dateChipLabel,
  loginViaUi,
  logoutViaUi,
  trackPageErrors,
  expectNoPageErrors,
  serviceRoleKey,
} from "./helpers";
import { SUPABASE_URL } from "../test-env";

/**
 * 跨角色业务闭环（真实点击，三个独立浏览器会话模拟三个人）：
 * 会员预约（pending）→ 老板在日历确认接单 → 技师打点到店/完成 → 会员端可见「已完成」
 */
test.describe("跨角色业务闭环", () => {
  test.beforeAll(async () => {
    // 隔离：清空测试会员的历史单据，日历/客单断言只反映本套件动作
    await purgeMemberAppointments();
  });

  test.afterAll(async () => {
    await cleanupBrowserTestData();
  });

  async function bookAsMember(page: Page) {
    const chip = dateChipLabel(2);
    await loginViaUi(
      page,
      CREDENTIALS.member.email,
      CREDENTIALS.member.password,
      "/my"
    );
    await page.goto("/book");
    await page.locator('button:has(span:text-is("姜汤头疗"))').click();
    await page.getByRole("button", { name: "下一步" }).click();
    await page.getByRole("button").filter({ hasText: "林小梓" }).click();
    await page.getByRole("button", { name: "下一步" }).click();
    await page.getByRole("button", { name: chip }).click();
    await page
      .getByRole("button")
      .filter({ hasText: /^\d{1,2}:\d{2}$/ })
      .first()
      .click();
    await page.getByRole("button", { name: "下一步" }).click();
    await page.fill("#remark", `${REMARK_TAG} 跨角色闭环`);
    await page.getByRole("button", { name: /确认呈送/ }).click();
    await expect(page.getByText("预约已敬呈")).toBeVisible();
  }

  test("会员预约成功并可在我的预约中看到（待确认）", async ({ page }) => {
    const errors = trackPageErrors(page);
    await bookAsMember(page);
    await page.getByRole("link", { name: "查看我的预约" }).click();
    await page.waitForURL("**/my");
    await expect(page.getByText("待确认").first()).toBeVisible();

    // 查库取真实 ID 验证
    const adminSvc = (await import("@supabase/supabase-js")).createClient(
      SUPABASE_URL,
      serviceRoleKey(),
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: apts } = await adminSvc
      .from("appointments")
      .select("id, status, remark, created_at")
      .like("remark", `%${REMARK_TAG}%`);
    console.log("【TEST1 结束时数据库记录】:", JSON.stringify(apts));
    expect(apts && apts.length > 0).toBeTruthy();

    expectNoPageErrors(errors);
  });

  test("老板在管理端确认接单", async ({ browser }) => {
    const bossCtx = await browser.newContext();
    const page = await bossCtx.newPage();
    const errors = trackPageErrors(page);

    await loginViaUi(
      page,
      CREDENTIALS.boss.email,
      CREDENTIALS.boss.password,
      "/admin"
    );

    // 仪表盘顶栏的「待确认预约」专栏自动浮现该新单，点击「处理此单」直接弹窗
    const triageHeading = page.getByRole("heading", { name: /待确认预约 \(/ });
    await expect(triageHeading).toBeVisible({ timeout: 45_000 });
    const triageCard = page.locator("div.overflow-hidden.rounded-2xl.border", {
      has: triageHeading,
    });
    const orderItem = triageCard.locator("div[role='button']", { hasText: "张女士" }).first();
    await expect(orderItem).toBeVisible();
    await orderItem.getByRole("button", { name: "处理此单" }).click();

    const dlg = page.locator('[role="dialog"]');
    await expect(dlg.getByText("预约编号")).toBeVisible();
    await dlg.getByRole("button", { name: "确认接单" }).click();

    // 验证弹窗关闭且待确认专栏完成流转消失
    await expect(dlg).toHaveCount(0, { timeout: 30_000 });

    // 数据库真值断言：确认接单已成功持久化落库
    const adminSvc = (await import("@supabase/supabase-js")).createClient(
      SUPABASE_URL,
      serviceRoleKey(),
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: dbApt } = await adminSvc
      .from("appointments")
      .select("status")
      .like("remark", `%${REMARK_TAG}%`)
      .single();
    expect(dbApt?.status).toBe("confirmed");

    await bossCtx.close();
    expectNoPageErrors(errors);
  });

  test("技师打点：顾客到店 → 完成服务", async ({ browser }) => {
    const staffCtx = await browser.newContext();
    const page = await staffCtx.newPage();
    const errors = trackPageErrors(page);

    await loginViaUi(
      page,
      CREDENTIALS.staff.email,
      CREDENTIALS.staff.password,
      "/staff"
    );
    await page.getByRole("tab", { name: "待履约客单" }).click();

    // 顾客到店
    const arriveBtn = page.getByRole("button", { name: "顾客到店" }).first();
    await expect(arriveBtn).toBeVisible({ timeout: 45_000 });
    await arriveBtn.click();
    await expect(page.getByText("已标记顾客到店")).toBeVisible();

    // 完成服务
    const doneBtn = page.getByRole("button", { name: "完成服务" }).first();
    await expect(doneBtn).toBeVisible({ timeout: 30_000 });
    await doneBtn.click();
    await expect(page.getByText("服务已完成")).toBeVisible();
    await expect(page.getByText("已完成").first()).toBeVisible();

    await staffCtx.close();
    expectNoPageErrors(errors);
  });

  test("会员端复核：历史足迹出现已完成记录", async ({ page }) => {
    const errors = trackPageErrors(page);
    await loginViaUi(
      page,
      CREDENTIALS.member.email,
      CREDENTIALS.member.password,
      "/my"
    );
    await page.getByRole("tab", { name: "资产变动" }).click();
    await page.getByRole("tab", { name: "预约手卷" }).click();
    await expect(page.getByText("历史足迹")).toBeVisible();
    await expect(page.getByText("已完成").first()).toBeVisible({ timeout: 30_000 });
    await logoutViaUi(page);
    expectNoPageErrors(errors);
  });
});
