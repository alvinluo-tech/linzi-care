import { expect, makeClient, q, retry, suite, SITE } from "../setup";

/**
 * 模块一：公开浏览与匿名 RLS 边界
 * 验证未登录用户能看到什么、看不到什么，以及 PWA 静态资源可用性。
 */
export const publicSpec = suite("公开浏览与匿名权限（未登录）", [
  {
    name: "GIVEN 未登录 WHEN 访问首页 THEN 200 且包含品牌与核心板块",
    run: async () => {
      const res = await fetch(`${SITE}/`);
      expect(res.status === 200, `首页状态码 ${res.status}`);
      const html = await res.text();
      expect(html.includes("林梓精养馆"), "首页缺少品牌名");
      expect(html.includes("身心归处"), "首页缺少主标语");
      expect(html.includes("健康四大基石"), "首页缺少四大基石板块");
      expect(html.includes("瑶浴头疗"), "首页缺少瑶浴头疗文化板块");
    },
  },
  {
    name: "GIVEN 未登录 WHEN 访问服务/商城/预约页 THEN 全部 200 且含页面标题",
    run: async () => {
      const checks: [string, string][] = [
        ["/services", "价目手卷"],
        ["/shop", "选品橱窗"],
        ["/book", "预约体验"],
      ];
      for (const [path, marker] of checks) {
        const res = await fetch(`${SITE}${path}`);
        const html = await res.text();
        expect(
          res.status === 200 && html.includes(marker),
          `${path} 状态 ${res.status} 或缺少「${marker}」`
        );
      }
    },
  },
  {
    name: "GIVEN PWA 静态资源 WHEN 请求 manifest/sw/图标 THEN 全部 200 且 manifest 含 standalone",
    run: async () => {
      const manifest = await fetch(`${SITE}/manifest.webmanifest`);
      const manifestBody = await manifest.text();
      expect(manifest.status === 200, "manifest 非 200");
      expect(manifestBody.includes('"standalone"'), "manifest 缺少 standalone");
      expect(manifestBody.includes("icon-192.png"), "manifest 缺少 192 图标");
      expect(manifestBody.includes("maskable"), "manifest 缺少 maskable 图标");

      for (const p of ["/sw.js", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable.png"]) {
        const res = await fetch(`${SITE}${p}`);
        expect(res.status === 200, `${p} 状态码 ${res.status}`);
      }
    },
  },
  {
    name: "GIVEN 匿名用户 WHEN 查询在售服务 THEN 返回 20 个真实项目且含会员价",
    run: async () => {
      const data = await retry(() =>
        q(makeClient().from("services").select("id, name, price, member_price").eq("is_active", true))
      );
      expect(data.length === 20, `在售服务应为 20 项，实际 ${data.length}`);
      const ginger = data.find((s: any) => s.name === "姜汤头疗");
      expect(!!ginger, "缺少「姜汤头疗」");
      expect(
        Number(ginger.price) === 68 && Number(ginger.member_price) === 38,
        "姜汤头疗价格与店内价目不符"
      );
    },
  },
  {
    name: "GIVEN 匿名用户 WHEN 读取受保护表（预约/会员/余额/订阅） THEN RLS 返回空集",
    run: async () => {
      const c = makeClient();
      for (const table of ["appointments", "members", "balance_logs", "push_subscriptions", "reminders"]) {
        const rows = await retry(() => q(c.from(table).select("*")));
        expect(Array.isArray(rows) && rows.length === 0, `${table} 匿名竞能读到 ${rows.length} 行`);
      }
    },
  },
  {
    name: "GIVEN 匿名用户 WHEN 查询技师排班时段 THEN 公开 RPC 正常返回",
    run: async () => {
      const c = makeClient();
      const staff = await retry(() => q(c.from("staff").select("id").eq("name", "林小梓").single()));
      expect(!!staff, "找不到技师 林小梓");
      const svc = await retry(() => q(c.from("services").select("id").eq("name", "姜汤头疗").single()));
      const future = new Date(Date.now() + 3 * 86400000);
      const dateStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
      const slots = await retry(() =>
        q(c.rpc("get_available_slots", { p_staff_id: staff.id, p_service_id: svc.id, p_date: dateStr }))
      );
      expect(Array.isArray(slots) && slots.length > 0, `匿名获取时段失败，返回 ${slots?.length ?? "null"} 个`);
    },
  },
  {
    name: "GIVEN 匿名用户 WHEN 访问管理端/员工端 THEN 页面不泄露内部内容",
    run: async () => {
      const admin = await fetch(`${SITE}/admin`, { redirect: "follow" });
      const adminHtml = await admin.text();
      expect(!adminHtml.includes("馆务总览"), "未登录竟能看到管理端仪表盘内容");

      const staff = await fetch(`${SITE}/staff`, { redirect: "follow" });
      const staffHtml = await staff.text();
      expect(!staffHtml.includes("工期与客单手卷"), "未登录竟能看到员工端内容");
    },
  },
]);
