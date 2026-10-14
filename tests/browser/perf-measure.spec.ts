/**
 * 性能基线采集（真实 Chromium 加载）
 * 用法：先 npm run build && npm run start（生产模式 :3002），再
 *   npx playwright test perf-measure.spec.ts
 * 输出各路由的 TTFB / DOMContentLoaded / Load / 请求数
 */
import { test } from "@playwright/test";
import { readNavTiming } from "./helpers";

const ROUTES = ["/", "/services", "/book", "/shop", "/login"];

test.describe("性能基线（生产模式）", () => {
  for (const route of ROUTES) {
    test(`采集 ${route} 的导航耗时`, async ({ page }) => {
      // 预热一次（排除首次 DNS/TLS 握手噪声），再取第二次加载的指标
      await page.goto(route, { waitUntil: "load" });
      const timing = await readNavTiming(page);
      // 冷启动之外再测一次软导航（客户端缓存态）
      await page.reload({ waitUntil: "load" });
      const warm = await readNavTiming(page);
      console.log(
        `[PERF] ${route}  TTFB=${timing?.ttfb}ms  DCL=${timing?.dcl}ms  Load=${timing?.load}ms  请求数=${timing?.requests}  |  热加载: TTFB=${warm?.ttfb}ms DCL=${warm?.dcl}ms Load=${warm?.load}ms 请求数=${warm?.requests}`
      );
    });
  }
});
