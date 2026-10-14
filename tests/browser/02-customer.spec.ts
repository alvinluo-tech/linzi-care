import { test, expect } from "@playwright/test";
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
} from "./helpers";

test.describe("顾客端 · 真实点击旅程", () => {
  // notifications permission granted via config

  test.beforeAll(async () => {
    // 隔离：清空测试会员的历史单据，保证「即将赴约」断言只反映本套件动作
    await purgeMemberAppointments();
  });

  test.afterAll(async () => {
    await cleanupBrowserTestData();
  });

  test("公开浏览：首页 → 服务价目 → 商城 → 商品详情（数据驱动，不依赖具体商品行）", async ({
    page,
  }) => {
    const errors = trackPageErrors(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /身心归处/ })).toBeVisible();
    await expect(page.getByText("广州市增城区新塘镇 · 国贸汇")).toBeVisible();

    await page.goto("/services");
    await expect(page.getByText("姜汤头疗").first()).toBeVisible();

    await page.goto("/shop");
    // 商城为数据驱动：断言至少一个商品卡片，点击进入详情
    const firstCard = page.locator('a[href^="/shop/"]').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await page.waitForURL("**/shop/**");
    // CTA 是 <Link>（role=link），不是 button
    await expect(page.getByRole("link", { name: /预约到店体验/ })).toBeVisible();
    expectNoPageErrors(errors);
  });

  test("登录个人中心：会籍卡、系统推送订阅、资产账折、资料保存", async ({
    page,
  }) => {
    const errors = trackPageErrors(page);

    await loginViaUi(
      page,
      CREDENTIALS.member.email,
      CREDENTIALS.member.password,
      "/my"
    );
    await expect(page.getByText("张女士 · 会籍档案")).toBeVisible();

    // 点击开启系统推送（无头环境初始可能为 default 或 denied）
    const pushPanel = page.getByText("开启系统提醒后", { exact: false });
    await expect(pushPanel).toBeVisible();
    const pushBtn = page
      .getByRole("button", { name: /开启预约提醒|通知已被禁用/ })
      .first();
    await expect(pushBtn).toBeVisible();
    await pushBtn.click();
    // 授权并订阅后或提示禁用后，按钮均稳定存在
    await expect(page.locator("button", { hasText: /预约提醒|通知/ }).first()).toBeVisible();

    // 资产账折
    await page.getByRole("tab", { name: "资产变动" }).click();
    await expect(page.getByText("收支审计账折")).toBeVisible();

    // 资料保存
    await page.getByRole("tab", { name: "修撰资料" }).click();
    await page.getByRole("button", { name: "保存修撰资料" }).click();
    await expect(page.getByText("资料已更新")).toBeVisible();

    await logoutViaUi(page);
    expectNoPageErrors(errors);
  });

  test("预约向导全程点击：选项目→技师→时段→呈送→我的预约→自取消", async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
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

    await page.fill("#remark", `${REMARK_TAG} 浏览器点击测试`);
    await page.getByRole("button", { name: /确认呈送/ }).click();
    await expect(page.getByText("预约已敬呈")).toBeVisible();

    // 前往我的预约，定位「即将赴约」区域内的卡片并撤回
    await page.getByRole("link", { name: "查看我的预约" }).click();
    await page.waitForURL("**/my");
    const upcomingSection = page.locator("section", { hasText: "即将赴约" });
    const myCard = upcomingSection
      .locator("div.rounded-xl.border")
      .filter({ hasText: "姜汤头疗" })
      .first();
    await expect(myCard).toBeVisible();
    await myCard.getByRole("button", { name: "撤回预约" }).click();
    await page
      .locator('[role="dialog"]')
      .getByRole("button", { name: "确认取消" })
      .click();
    await expect(page.getByText("预约已取消")).toBeVisible();
    await expect(upcomingSection.getByText("暂无即将赴约的排班")).toBeVisible();

    await logoutViaUi(page);
    expectNoPageErrors(errors);
  });
});

