import { test, expect } from "@playwright/test";
import { CREDENTIALS } from "./helpers";

/**
 * 定向验证历史账号芯片：直接写入 localStorage（模拟此前成功登录留下的记录），
 * 避免依赖「UI 登录是否被代理卡住」，从而独立证明芯片的渲染/回填/删除逻辑。
 */
test("登录页：历史账号芯片渲染、点击回填邮箱（不回填密码）、可删除", async ({ page }) => {
  const email = CREDENTIALS.member.email;
  await page.addInitScript((e) => {
    localStorage.setItem(
      "linzi:login-accounts",
      JSON.stringify([{ email: e, lastUsedAt: Date.now() }])
    );
  }, email);

  await page.goto("/login");
  await expect(page.getByText("最近登录")).toBeVisible({ timeout: 15_000 });

  const chip = page.getByRole("button", { name: email, exact: true });
  await expect(chip).toBeVisible();
  await chip.click();

  await expect(page.locator("#email")).toHaveValue(email);
  await expect(page.locator("#password")).toHaveValue("");

  // 删除芯片
  await page.getByRole("button", { name: `移除 ${email}` }).click();
  await expect(page.getByText("最近登录")).toHaveCount(0);
  console.log("  ok 历史账号：渲染 / 回填 / 不回填密码 / 删除 均正确");
});
