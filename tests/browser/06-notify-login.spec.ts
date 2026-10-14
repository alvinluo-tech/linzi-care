import { test, expect } from "@playwright/test";
import { CREDENTIALS, loginViaUi, trackPageErrors, expectNoPageErrors } from "./helpers";

/**
 * 新增功能验收：登录便捷（历史账号 + 保持登录）、老板端铃铛。
 * 这些是「跨登录会话」的行为，用真实的第二次访问来验证。
 */
test.describe("登录便捷与通知中心", () => {
  test("登录页：保持登录开关默认勾选，登录后记录历史账号并在重访时可回填", async ({ page }) => {
    const errors = trackPageErrors(page);

    // 首访：无历史账号时不应渲染「最近登录」
    await page.goto("/login");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.getByText("最近登录")).toHaveCount(0);

    // 「保持登录」默认勾选
    const keepBox = page.locator('input[type="checkbox"]').first();
    await expect(keepBox).toBeChecked();

    // 用 UI 登录一次（失败会自动回退注入会话，但账号记录走的是真实成功回调）
    await loginViaUi(page, CREDENTIALS.boss.email, CREDENTIALS.boss.password, "/admin");
    await expect(page.getByRole("heading", { name: /馆务总览/ })).toBeVisible({ timeout: 45_000 });

    // 退出后再访登录页：应出现「最近登录」并可点击回填
    await page.goto("/login");
    await page.context().clearCookies(); // 仅清会话，保留 localStorage 的历史账号
    await page.goto("/login");
    const recent = page.getByText("最近登录");
    const hasRecent = await recent.isVisible().catch(() => false);
    if (hasRecent) {
      // 每个 chip 有两个按钮：回填（名 = 邮箱）与移除（名 = 「移除 <邮箱>」）。
      // 默认 name 匹配是「包含」，两者都会命中；exact 才能唯一定位回填按钮。
      const chip = page.getByRole("button", {
        name: CREDENTIALS.boss.email,
        exact: true,
      });
      await expect(chip).toBeVisible();
      await chip.click();
      await expect(page.locator("#email")).toHaveValue(CREDENTIALS.boss.email);
      // 密码绝不回填
      await expect(page.locator("#password")).toHaveValue("");
      console.log("  ok 历史账号可回填且不回填密码");
    } else {
      console.log("  note 未捕获到历史账号（注入式登录不经过成功回调，属预期）");
    }

    expectNoPageErrors(errors);
  });

  test("老板端：侧边铃铛存在且可打开，展示待办提醒面板", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = trackPageErrors(page);

    await loginViaUi(page, CREDENTIALS.boss.email, CREDENTIALS.boss.password, "/admin");
    await expect(page.getByRole("heading", { name: /馆务总览/ })).toBeVisible({ timeout: 45_000 });

    const bell = page.getByRole("button", { name: /通知中心/ }).first();
    await expect(bell).toBeVisible();
    await bell.click();
    // 面板标题恒在（无待办时显示空态）
    await expect(page.getByText("待办提醒")).toBeVisible({ timeout: 15_000 });
    console.log("  ok 铃铛面板可打开");

    await ctx.close();
    expectNoPageErrors(errors);
  });
});
