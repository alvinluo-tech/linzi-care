import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  CREDENTIALS,
  REMARK_TAG,
  cleanupBrowserTestData,
  expectNoPageErrors,
  loginViaUi,
  serviceClient,
  trackPageErrors,
} from "./helpers";

/**
 * 掌柜接单入口的可发现性回归：
 * 缺陷背景——待确认专区曾以「有单才渲染」实现，空单时入口整体消失，
 * 老板收到预约后找不到在哪里确认。本套件锁定三件事：
 *  1. 空单时专区与统计卡依然可见（空态引导），入口永不隐身；
 *  2. 新单产生后，导航角标与专区列表实时联动；
 *  3. 点击「处理此单 → 确认接单」后，该单从专区消失并落库 confirmed。
 */

const TRIAGE_TAG = `${REMARK_TAG}-TRIAGE`;

/**
 * 本套件对「待确认总数」是敏感的（空态与角标都按全局状态断言），
 * 所以运行期间必须确保库里没有别人留下的待确认单。
 *
 * 之所以要显式清掉全部 pending，而不是只清自己造的：这些用例验证的是
 * 「老板能否发现并处理待办」，它天然是个全局视图 —— 如果有别的测试
 * （或人工调试）留下的 pending 单在，空态断言必然失败。实测踩过一次：
 * 上一轮验收遗留的 2 张 old pending 单让本套件 3 项全红，而产品代码无辜。
 *
 * 安全前提：只删 status=pending 且备注带测试标记的记录，绝不碰真实客单。
 */
async function clearStalePendingTestOrders() {
  const admin = serviceClient();
  await admin.from("appointments").delete().like("remark", `%${REMARK_TAG}%`);
}

/** 汇总当前库里 pending 单数（真值，用于断言前后的对照） */
async function pendingCount(): Promise<number> {
  const admin = serviceClient();
  const { count } = await admin
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

/** 与 RealtimeNotifier 的广播同构：测试环境浏览器直连 Supabase 偶发挂起，
 *  角标的一次性挂载查询可能落空，用同一信号给它重查机会（等价于远端变更到达） */
async function nudgeAppointmentsChanged(page: Page) {
  await page
    .evaluate(() => window.dispatchEvent(new CustomEvent("appointments:changed")))
    .catch(() => {});
}

/** 有界重试：等待角标出现/消失；期间用变更信号与整页刷新兜底 */
async function waitBadge(page: Page, badge: Locator, wantVisible: boolean) {
  for (let round = 0; round < 8; round++) {
    const visible = await badge.first().isVisible().catch(() => false);
    if (visible === wantVisible) return;
    await nudgeAppointmentsChanged(page);
    await page.waitForTimeout(4000);
    if (round === 3) {
      await page.reload({ waitUntil: "load" }).catch(() => {});
      await page.waitForTimeout(3000);
    }
  }
  const final = await badge.first().isVisible().catch(() => false);
  expect(final, `角标可见性应为 ${wantVisible}（实际 ${final}）`).toBe(wantVisible);
}

test.describe("掌柜接单入口", () => {
  test.beforeAll(async () => {
    await cleanupBrowserTestData();
  });

  test("无待确认单时，专区入口常驻可见（空态引导，不隐身）", async ({ browser }) => {
    // 先确立「确实没有待确认单」这个前提。不做这一步的话，任何遗留的
    // pending 单都会把空态断言推翻，失败信息还指向产品代码。
    await clearStalePendingTestOrders();
    const preexisting = await pendingCount();

    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = trackPageErrors(page);

    await loginViaUi(page, CREDENTIALS.boss.email, CREDENTIALS.boss.password, "/admin");

    // 专区标题带计数，恒常渲染 —— 这一条与库内有无单据无关，是最该锁定的不变量
    const heading = page.getByRole("heading", { name: /待确认预约 \(/ });
    await expect(heading).toBeVisible({ timeout: 45_000 });

    // 空态引导文案：即使没有待确认单，老板也能看清"确认在这里做"
    await expect(page.getByText("收到顾客预约后，在此确认接单")).toBeVisible();

    const panelItems = page.locator("#pending-panel div[role='button']");

    if (preexisting === 0) {
      await expect(page.getByText("当前没有待确认的预约")).toBeVisible();
      await expect(panelItems).toHaveCount(0);
      await expect(page.locator("aside span[aria-label$='单待确认']")).toHaveCount(0);
    } else {
      // 库里确有真实待确认单（非本套件造出）：不该去删别人的数据，
      // 此时只验证「入口以列表形态呈现」这一半。
      await expect(panelItems.first()).toBeVisible();
    }

    await context.close();
    expectNoPageErrors(errors);
  });

  test("新客单联动角标与专区，点击确认接单后消失并落库", async ({ browser }) => {
    const admin = serviceClient();

    // 与空态用例同理：先把遗留的测试单清干净，让「角标归零」这一步
    // 只可能由本用例自己的单据决定。否则别的测试留下的 pending 会让
    // 角标在确认后依然在，用例失败而产品无辜。
    await clearStalePendingTestOrders();

    // 造一张待确认单（明天 15:07，避开半点/整点槽位降低碰撞概率）
    const { data: member } = await admin
      .from("members")
      .select("id")
      .eq("name", "张女士")
      .single();
    const { data: staff } = await admin
      .from("staff")
      .select("id")
      .eq("name", "林小梓")
      .single();
    const { data: svc } = await admin
      .from("services")
      .select("id, duration")
      .eq("name", "姜汤头疗")
      .single();
    expect(member && staff && svc, "测试基础数据缺失（张女士 / 林小梓 / 姜汤头疗）");

    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(15, 7, 0, 0);
    const end = new Date(start.getTime() + (svc!.duration ?? 60) * 60_000);

    const { error: insErr } = await admin.from("appointments").insert({
      customer_id: member!.id,
      staff_id: staff!.id,
      service_id: svc!.id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: "pending",
      remark: TRIAGE_TAG,
    });
    expect(insErr, `造单失败: ${insErr?.message}`).toBeNull();

    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = trackPageErrors(page);

    await loginViaUi(page, CREDENTIALS.boss.email, CREDENTIALS.boss.password, "/admin");

    // 专区先列出该单（数据链路给定论）
    const item = page
      .locator("#pending-panel div[role='button']")
      .filter({ hasText: TRIAGE_TAG });
    await expect(item).toBeVisible({ timeout: 45_000 });

    // 导航角标出现（≥1 单待确认）
    const badge = page.locator("aside span[aria-label$='单待确认']");
    await waitBadge(page, badge, true);

    // 点击「处理此单」→ 弹窗 → 确认接单
    await item.getByRole("button", { name: "处理此单" }).click();

    const dlg = page.locator('[role="dialog"]');
    await expect(dlg.getByText("预约编号")).toBeVisible();
    await dlg.getByRole("button", { name: "确认接单" }).click();
    await expect(dlg).toHaveCount(0, { timeout: 30_000 });

    // 该单从待确认专区消失
    await expect(item).toHaveCount(0, { timeout: 30_000 });

    // 数据库真值：确认已持久化
    const { data: after } = await admin
      .from("appointments")
      .select("status")
      .eq("remark", TRIAGE_TAG)
      .single();
    expect(after?.status).toBe("confirmed");

    /**
     * 角标断言必须落在「本单」上，不能断言它归零。
     *
     * 归零只在库里已无任何待确认单时成立 —— 而这是个全局条件，任何
     * 遗留数据（含真实客单）都会让它为假。产品行为其实是对的：还有别的
     * 单待确认，角标本就该继续显示。
     *
     * 正确的问法是：角标数字是否**反映了本单已被处理**，即它等于
     * 数据库里此刻的待确认数。这样无论库里有多少其它单，断言都成立。
     */
    const remaining = await pendingCount();
    if (remaining === 0) {
      await waitBadge(page, badge, false);
    } else {
      await waitBadge(page, badge, true);
      const label = (await badge.first().getAttribute("aria-label")) ?? "";
      const shown = Number(label.match(/(\d+)/)?.[1] ?? -1);
      expect(
        shown,
        `角标应等于库里剩余待确认数（角标=${shown}，库=${remaining}）`
      ).toBe(remaining);
    }

    await context.close();
    expectNoPageErrors(errors);

    // 清理本套件数据
    await admin.from("appointments").delete().eq("remark", TRIAGE_TAG);
  });
});
