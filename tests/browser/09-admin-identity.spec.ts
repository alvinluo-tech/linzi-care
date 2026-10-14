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
 * 对抗性验收：管理端取数必须走服务端核验过的 admin 身份。
 *
 * 回归目标（用户报告的故障）：员工点击「完成服务」后，老板后台日历里
 * 客户名变成「匿名客户」。
 *
 * 根因：管理端页面在浏览器里用当前 cookie 会话直连取数；若该会话不是
 * admin（共用设备 / dev-prod 双服务 shared-cookie 轮换错位），
 * appointments 行仍可读（策略允许 staff 读自己的单），但其内嵌的
 * members 关联会被 members 表 RLS 静默过滤成 null，
 * 前端 `?? "匿名客户"` 兜底随即把「读不到客户」显示成「匿名客户」。
 *
 * 修复：/api/admin/* 在服务端核验 admin 身份后取数；非 admin 明文 403。
 */
test.describe("管理端取数身份隔离（对抗性验收）", () => {
  const tag = "ANON-FIX";
  let apptId = "";

  test.beforeAll(async () => {
    const admin = serviceClient();
    // 先清掉可能残留的同标记数据与同技师同时段的占用，避免唯一约束冲突
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

    // 从固定时隙起按半小时回退，找一个该技师真正空闲的时段：
    // appointments_staff_start_active_idx 是 (staff_id, start_time) 的部分唯一索引，
    // 撞了会直接插入失败。
    const taken = new Set(
      (
        await admin
          .from("appointments")
          .select("start_time")
          .eq("staff_id", staff.id)
      ).data?.map((r) => r.start_time) ?? []
    );
    let slot: Date | null = null;
    const probe = new Date();
    probe.setDate(probe.getDate() + 1);
    probe.setHours(15, 30, 0, 0);
    for (let i = 0; i < 24 && !slot; i++) {
      if (!taken.has(probe.toISOString())) slot = new Date(probe);
      probe.setMinutes(probe.getMinutes() - 30);
    }
    expect(slot, "找不到空闲时段").toBeTruthy();
    const start = slot!;

    // 造一笔「已完成」的单，让日历呈现绿色色块（与故障截图同类）。
    const { data, error } = await admin.from("appointments").insert({
      customer_id: member.id, staff_id: staff.id, service_id: svc.id,
      start_time: start.toISOString(),
      end_time: new Date(start.getTime() + (svc!.duration ?? 60) * 60000).toISOString(),
      status: "done", remark: tag, charged_amount: 0, payment_state: "legacy",
    }).select("id").single();
    expect(error, error?.message).toBeNull();
    apptId = data!.id;
  });

  test.afterAll(async () => {
    await serviceClient().from("appointments").delete().like("remark", `%${tag}%`);
  });

  test("A. 老板身份：日历/接口返回真实客户名「张女士」，绝不出现「匿名客户」", async ({ page }) => {
    await loginViaUi(page, CREDENTIALS.boss.email, CREDENTIALS.boss.password, "/admin/calendar");
    await expect(page.getByRole("heading", { name: /排班与预约日历/ })).toBeVisible({ timeout: 45_000 });

    // 直接打接口：服务端 admin 身份读出内嵌 members.name
    const res = await page.request.get("/api/admin/appointments");
    expect(res.status(), "老板调用管理端接口应 200").toBe(200);
    const json = (await res.json()) as {
      appointments: { id: string; members: { name: string } | null }[];
    };
    const row = json.appointments.find((a) => a.id === apptId);
    expect(row, "应能在返回中找到刚造的预约").toBeTruthy();
    expect(row!.members?.name, "客户名不得为空（否则 UI 会显示匿名客户）").toBe("张女士");

    // UI 层：日历事件标题必须带真实客户名
    await page.waitForTimeout(6000);
    const title = await page
      .locator(".sx__time-grid-event-title", { hasText: /张女士/ })
      .first()
      .textContent({ timeout: 15_000 })
      .catch(() => null);
    expect(title, "日历事件标题应含「张女士」").toContain("张女士");
    expect(title, "不得出现匿名客户兜底文案").not.toContain("匿名客户");
  });

  test("B. 员工身份调用管理端接口：必须 403，绝不返回 members=null 的 200", async ({ page }) => {
    await loginViaUi(page, CREDENTIALS.staff.email, CREDENTIALS.staff.password, "/staff");

    const res = await page.request.get("/api/admin/appointments");
    expect(res.status(), "员工调用管理端接口必须被拒绝").toBe(403);
    const json = (await res.json()) as { error?: string; appointments?: unknown };
    expect(json.appointments, "被拒时不得返回任何预约数据").toBeUndefined();
    expect(json.error ?? "", "应给出明确原因").toContain("老板");
  });

  test("C. 复现根因：员工身份在前端直连 appointments，members 关联被 RLS 置空", async ({ page }) => {
    // 自己造一条「分配给该员工」的单，避免依赖其它套件残留的数据
    const svc = serviceClient();
    const { data: member } = await svc.from("members").select("id").eq("name", "张女士").single();
    const { data: staff } = await svc.from("staff").select("id").eq("name", "林小梓").single();
    const { data: service } = await svc.from("services").select("id, duration").eq("name", "姜汤头疗").single();
    // 选空闲时段：(staff_id, start_time) 有部分唯一索引，撞了会插入失败
    const taken = new Set(
      (await svc.from("appointments").select("start_time").eq("staff_id", staff.id))
        .data?.map((r) => r.start_time) ?? []
    );
    let slot: Date | null = null;
    const probe = new Date();
    probe.setDate(probe.getDate() + 1);
    probe.setHours(11, 15, 0, 0);
    for (let i = 0; i < 24 && !slot; i++) {
      if (!taken.has(probe.toISOString())) slot = new Date(probe);
      probe.setMinutes(probe.getMinutes() - 30);
    }
    expect(slot, "找不到空闲时段").toBeTruthy();
    const start = slot!;
    const { data: row, error } = await svc.from("appointments").insert({
      customer_id: member.id,
      staff_id: staff.id,
      service_id: service!.id,
      start_time: start.toISOString(),
      end_time: new Date(start.getTime() + (service!.duration ?? 60) * 60000).toISOString(),
      status: "confirmed",
      remark: `${tag}-ROOTCAUSE`,
      charged_amount: 0,
      payment_state: "legacy",
    }).select("id").single();
    expect(error, error?.message).toBeNull();
    const rootCauseId = row!.id;

    try {
      await loginViaUi(page, CREDENTIALS.staff.email, CREDENTIALS.staff.password, "/staff");

      // 用员工身份在浏览器里直连数据库（这正是修复前的取数方式）。
      const supabaseUrl = SUPABASE_URL;
      const anonKey =
        ANON_KEY;

      // AUTH_STORAGE_KEY 是模块级常量，浏览器上下文里不存在，
      // 必须作为参数传进 page.evaluate（否则报 _helpers is not defined）。
      const staffJwt = await page.evaluate(
        (key) => {
          const raw = localStorage.getItem(key);
          return raw ? (JSON.parse(raw).access_token as string) : null;
        },
        AUTH_STORAGE_KEY
      );
      expect(staffJwt, "员工会话应已注入 localStorage").toBeTruthy();

      const result = await page.evaluate(
        async (args: { url: string; key: string; jwt: string; aid: string }) => {
          const res = await fetch(
            `${args.url}/rest/v1/appointments?id=eq.${args.aid}&select=id,status,members(id,name)`,
            { headers: { apikey: args.key, Authorization: `Bearer ${args.jwt}` } }
          );
          return res.json();
        },
        { url: supabaseUrl, key: anonKey, jwt: staffJwt!, aid: rootCauseId }
      );

      const rows = result as { id: string; members?: { name?: string } | null }[];
      expect(rows.length, "员工应能读到分配给自己名下的该单（行可见）").toBeGreaterThan(0);
      expect(
        rows[0].members?.name ?? null,
        "员工身份下 members 关联被 RLS 置空 —— 这正是「匿名客户」的根因，" +
          "也正是必须把管理端取数挪到服务端的原因"
      ).toBeNull();
    } finally {
      await svc.from("appointments").delete().eq("id", rootCauseId);
    }
  });

  test("D. 待确认角标：员工身份不得拿到全店待确认数（防越权读取）", async ({ page }) => {
    await loginViaUi(page, CREDENTIALS.staff.email, CREDENTIALS.staff.password, "/staff");
    const res = await page.request.get("/api/admin/pending-count");
    expect(res.status(), "待确认计数同样属管理端数据").toBe(403);
  });
});
