/**
 * 精确验证 data-open 变体的动画落在 **弹层内容** 上，而不是触发器按钮上。
 *
 * 上一版失误：`[data-state="open"]` 第一个命中是 sheet-trigger 按钮本身，
 * 它当然没有动画 —— 那是探针选错元素，不是产品问题。组件源码里
 * data-open 变体是写在 SheetContent / DialogContent 上的。
 * 这里按 data-slot 精确定位内容面板。
 */
import { chromium, devices } from "playwright";
import { loadEnv } from "../tests/load-env";

loadEnv();
const SITE = process.env.E2E_SITE ?? "http://localhost:3002";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();

await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);

const trigger = page.locator('button[aria-label*="菜单"]').first();
if ((await trigger.count()) === 0) {
  console.log("✗ 未找到抽屉触发器");
  await browser.close();
  process.exit(1);
}
await trigger.click();
await page.waitForTimeout(1000);

const info = await page.evaluate(() => {
  // 优先找 sheet 的内容面板（组件源码里 data-open 变体挂在 SheetContent 上）
  const selectors = [
    '[data-slot="sheet-content"][data-state="open"]',
    '[data-slot="sheet-content"]',
    '[role="dialog"][data-state="open"]',
    '[role="dialog"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      matchedSelector: sel,
      tag: el.tagName,
      slot: el.getAttribute("data-slot"),
      state: el.getAttribute("data-state"),
      animationName: cs.animationName,
      animationDuration: cs.animationDuration,
      opacity: cs.opacity,
      transform: cs.transform,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }
  return null;
});

if (!info) {
  console.log("✗ 展开后未找到弹层内容面板");
  await browser.close();
  process.exit(1);
}

console.log("弹层内容面板：");
console.log(JSON.stringify(info, null, 2));

const hasAnim =
  !!info.animationName && info.animationName !== "none" && info.animationName !== "";
const isRendered = info.width > 0 && info.height > 0;

console.log(`\n  动画已应用: ${hasAnim ? "是" : "否"}  (${info.animationName})`);
console.log(`  面板已渲染: ${isRendered ? "是" : "否"}  (${info.width}×${info.height})`);

const ok = hasAnim && isRendered;
console.log(
  `\n${ok ? "✓" : "✗"} vendored CSS 的 data-open 变体确实驱动了弹层入场动画`
);

await browser.close();
process.exit(ok ? 0 : 1);
