import { test, expect } from "@playwright/test";
import { CREDENTIALS, loginViaUi, serviceClient, trackPageErrors, expectNoPageErrors } from "./helpers";

/**
 * 后台日历正确性：顾客预约后，日历必须
 *   1) 显示该事件（修复前整个时间网格崩溃、什么都看不到）
 *   2) 时间标签是「店铺时区 10:30」，不是 UTC 02:30
 */
test.describe("后台日历", () => {
  const tag = "CAL-VIS";

  test.afterAll(async () => {
    await serviceClient().from("appointments").delete().like("remark", `%${tag}%`);
  });

  test("顾客预约后，日历显示该单且时间为门店时区 10:30", async ({ page }) => {
    const errors = trackPageErrors(page);
    const admin = serviceClient();

    const { data: member } = await admin.from("members").select("id").eq("name", "张女士").single();
    const { data: staff } = await admin.from("staff").select("id").eq("name", "林小梓").single();
    const { data: svc } = await admin.from("services").select("id, duration").eq("name", "姜汤头疗").single();

    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(10, 30, 0, 0);
    const { data: appt, error } = await admin.from("appointments").insert({
      customer_id: member.id, staff_id: staff.id, service_id: svc.id,
      start_time: start.toISOString(),
      end_time: new Date(start.getTime() + (svc.duration ?? 60) * 60000).toISOString(),
      status: "pending", remark: tag, charged_amount: 0, payment_state: "legacy",
    }).select("id").single();
    expect(error, error?.message).toBeNull();

    await loginViaUi(page, CREDENTIALS.boss.email, CREDENTIALS.boss.password, "/admin/calendar");
    await expect(page.getByRole("heading", { name: /排班与预约日历/ })).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(8000);

    // 1) 事件可见
    await expect(
      page.locator(".sx__time-grid-event-title", { hasText: /张女士 · 姜汤头疗/ }).first(),
      "日历未渲染该预约（时间网格崩溃）"
    ).toBeVisible({ timeout: 15_000 });

    // 2) 时间标签是门店时区：应显示 10:30，且不得出现 UTC 的 02:30
    const timeText = await page
      .locator(".sx__time-grid-event-time")
      .first()
      .textContent();
    console.log("  事件时间标签:", JSON.stringify(timeText));
    expect(timeText, `事件应显示门店时区 10:30，实际: ${timeText}`).toContain("10:30");
    expect(timeText, `事件不应显示 UTC 时间 02:30，实际: ${timeText}`).not.toContain("02:30");

    // 3) 点击色块应能弹出处理对话框（日历的核心用途：就地接单）
    await page.locator(".sx__time-grid-event-title").first().click();
    const dlg = page.locator('[role="dialog"]');
    await expect(dlg.getByText("预约编号")).toBeVisible({ timeout: 15_000 });
    await expect(dlg.getByRole("button", { name: "确认接单" })).toBeVisible();
    console.log("  ok 点击色块可直接处理客单");

    await admin.from("appointments").delete().eq("id", appt.id);
    expectNoPageErrors(errors);
  });
});
