import { defineConfig } from "@playwright/test";

/**
 * 真实点击级浏览器测试（Playwright + Chromium）
 * - 被测对象：本地生产服务（:3002，需先 npm run build && npx next start -p 3002）
 * - 网络：浏览器经本地代理访问远程 Supabase（E2E_PROXY 可覆盖），localhost 直连
 * - 真实点击：所有登录/预约/确认/打点均通过 UI 操作完成；
 *   UI 登录若遇 fetch 挂起，自动回退为 API 会话注入（cookie + localStorage）
 * - perf-measure 为按需性能采集，默认不参与回归
 */
export default defineConfig({
  testDir: "./tests/browser",
  testIgnore: ["**/perf-measure.spec.ts"],
  timeout: 240_000,
  expect: { timeout: 25_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3002",
    actionTimeout: 25_000,
    navigationTimeout: 120_000,
    trace: "retain-on-failure",
    permissions: ["notifications"],
    launchOptions: {
      proxy: {
        server: process.env.E2E_PROXY ?? "http://127.0.0.1:7897",
        bypass: "localhost,127.0.0.1",
      },
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
