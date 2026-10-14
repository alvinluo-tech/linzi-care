import { test, expect } from "@playwright/test";
import {
  CREDENTIALS,
  loginViaUi,
  logoutViaUi,
  trackPageErrors,
  expectNoPageErrors,
  dateChipLabel,
} from "./helpers";

test.describe("访问控制与边界情况", () => {
  test("未登录访问受保护路由 → 一律重定向到 /login", async ({ page }) => {
    const errors = trackPageErrors(page);

    for (const route of ["/admin", "/staff", "/my"]) {
      // GIVEN 未登录 WHEN 直接访问受保护路由 THEN 被重定向到登录页
      await page.goto(route);
      await page.waitForURL("**/login**", { timeout: 60_000 });
      await expect(page.locator("#email")).toBeVisible();
    }
    expectNoPageErrors(errors);
  });

  test("错误凭证登录 → 明确报错且不进入系统", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/login");
    await page.fill("#email", CREDENTIALS.member.email);
    await page.fill("#password", "wrong-password-123");
    await page.getByRole("button", { name: "登 录" }).click();
    await expect(page.getByText("登录失败")).toBeVisible({ timeout: 30_000 });
    // 仍停留在登录页
    await expect(page.locator("#email")).toBeVisible();
    expectNoPageErrors(errors);
  });

  test("顾客访问 /admin → 弹回 /my；员工访问 /admin → 弹回 /staff；老板访问 /staff → 弹回 /admin", async ({
    page,
  }) => {
    const errors = trackPageErrors(page);

    // 会员访问管理端
    await loginViaUi(page, CREDENTIALS.member.email, CREDENTIALS.member.password, "/my");
    await page.goto("/admin");
    await page.waitForURL("**/my", { timeout: 60_000 });
    await logoutViaUi(page);

    // 员工访问管理端
    await loginViaUi(page, CREDENTIALS.staff.email, CREDENTIALS.staff.password, "/staff");
    await page.goto("/admin");
    await page.waitForURL("**/staff", { timeout: 60_000 });
    await logoutViaUi(page);

    // 老板访问员工端
    await loginViaUi(page, CREDENTIALS.boss.email, CREDENTIALS.boss.password, "/admin");
    await page.goto("/staff");
    await page.waitForURL("**/admin", { timeout: 60_000 });
    await logoutViaUi(page);

    expectNoPageErrors(errors);
  });

  test("预约向导状态跨登录保留（边际：选到一半去登录，回来不丢）", async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    const chip = dateChipLabel(2);

    // GIVEN 未登录顾客已选好项目/技师/时段
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

    // WHEN 点击「登录会籍账号」并完成登录
    await page.getByRole("button", { name: "登录会籍账号" }).click();
    await page.waitForURL("**/login**", { timeout: 60_000 });
    await page.fill("#email", CREDENTIALS.member.email);
    await page.fill("#password", CREDENTIALS.member.password);
    await page.getByRole("button", { name: "登 录" }).click();
    await page.waitForURL("**/book", { timeout: 60_000 });

    // THEN 回到向导第 4 步，已选内容完整保留
    await expect(page.getByText("核对并呈送预约")).toBeVisible();
    await expect(page.getByText("姜汤头疗").first()).toBeVisible();
    expectNoPageErrors(errors);
  });
});

test.describe("移动端视口（新中式抽屉导航）", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("抽屉导航可用、核心内容可达", async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto("/");
    const menu = page.getByRole("button", { name: "打开菜单" });
    await expect(menu).toBeVisible();
    await menu.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("服务项目")).toBeVisible();
    await drawer.getByText("服务项目").first().click();
    await page.waitForURL("**/services");
    await expect(page.getByText("姜汤头疗").first()).toBeVisible();
    expectNoPageErrors(errors);
  });
});
