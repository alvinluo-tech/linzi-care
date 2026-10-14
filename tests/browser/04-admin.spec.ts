import { test, expect } from "@playwright/test";
import {
  CREDENTIALS,
  loginViaUi,
  logoutViaUi,
  trackPageErrors,
  expectNoPageErrors,
} from "./helpers";

test.describe("管理端 · 真实点击旅程", () => {
  test("仪表盘与侧边栏导航：统计卡渲染、日历/报表可达", async ({ page }) => {
    const errors = trackPageErrors(page);

    await loginViaUi(
      page,
      CREDENTIALS.boss.email,
      CREDENTIALS.boss.password,
      "/admin"
    );

    // 六角统计台
    await expect(page.getByText("今日预约客次")).toBeVisible();
    await expect(page.getByText("会员余额存管")).toBeVisible();

    // 侧边栏 → 预约日历
    await page.getByRole("link", { name: "预约日历" }).click();
    await page.waitForURL("**/admin/calendar");
    await expect(page.getByRole("heading", { name: "预约日历" })).toBeVisible();

    // 侧边栏 → 基础报表
    await page.getByRole("link", { name: "基础报表" }).click();
    await page.waitForURL("**/admin/reports");
    await expect(
      page.getByRole("heading", { name: /报表分析/ })
    ).toBeVisible();

    await logoutViaUi(page);
    expectNoPageErrors(errors);
  });

  test("会员余额调整（UI 增减 + 回复原值，全程对话框操作）", async ({ page }) => {
    const errors = trackPageErrors(page);

    await loginViaUi(
      page,
      CREDENTIALS.boss.email,
      CREDENTIALS.boss.password,
      "/admin/members"
    );
    const row = page.locator("tr", { hasText: "张女士" });
    await expect(row).toBeVisible();

    // 第一次：+13
    await row.getByRole("button", { name: "调余额" }).click();
    const dlg = page.locator('[role="dialog"]');
    await expect(dlg).toBeVisible();
    const beforeText = await dlg
      .getByText(/当前账户结余/)
      .textContent();
    const before = Number(beforeText?.match(/¥([\d.]+)/)?.[1] ?? "0");

    await dlg.getByRole("button", { name: "增减变动差额" }).click();
    await dlg.locator('input[type="number"]').fill("13");
    await dlg.getByRole("button", { name: "确认入账" }).click();
    await expect(
      page.getByText(/余额已更新|入账成功/).first()
    ).toBeVisible();

    // 复核：重新打开对话框，当前结余应为 before + 13
    await row.getByRole("button", { name: "调余额" }).click();
    await expect(dlg).toBeVisible();
    const afterText = await dlg
      .getByText(/当前账户结余/)
      .textContent();
    const after = Number(afterText?.match(/¥([\d.]+)/)?.[1] ?? "0");
    expect(Math.abs(after - (before + 13))).toBeLessThan(0.01);

    // 回复原值：-13
    await dlg.getByRole("button", { name: "增减变动差额" }).click();
    await dlg.locator('input[type="number"]').fill("-13");
    await dlg.getByRole("button", { name: "确认入账" }).click();
    await expect(
      page.getByText(/余额已更新|入账成功/).first()
    ).toBeVisible();
    await page.keyboard.press("Escape");

    expectNoPageErrors(errors);
  });
});
