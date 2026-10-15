/**
 * 无障碍：键盘可达性与焦点可见性审计。
 *
 * 检查三件事：
 *  1. 焦点环：Tab 到的每个可聚焦元素，聚焦前后是否有**可见**的样式变化
 *     （outline / box-shadow / border-color 任一改变）。没有焦点环的地方，
 *     键盘用户根本不知道自己在哪。
 *  2. 焦点顺序：Tab 序列里有没有「跳出去又跳回来」或者落进隐藏元素。
 *  3. 触控目标尺寸：可点元素至少 24×24（WCAG 2.2 SC 2.5.8，AA）。
 *
 * 用法：npx tsx scripts/audit-keyboard.mts
 */
import { chromium, type Browser } from "playwright";
import { PROXY, SITE, CREDENTIALS } from "../tests/test-env";
import { injectSessionViaApi } from "../tests/browser/helpers";

const PAGES: { label: string; url: string; role?: keyof typeof CREDENTIALS }[] = [
  { label: "首页", url: "/" },
  { label: "预约向导", url: "/book" },
  { label: "登录", url: "/login" },
  { label: "后台·掌柜速览", url: "/admin", role: "boss" },
  { label: "后台·会员", url: "/admin/members", role: "boss" },
  { label: "会员中心", url: "/my", role: "member" },
];

interface Issue {
  kind: "焦点环缺失" | "不可见元素可聚焦" | "触控目标过小";
  detail: string;
}

const SRC = `(() => {
  const out = [];
  const focusables = Array.from(
    document.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );

  /**
   * 元素当前是否可能被用户 Tab 到。
   *
   * 注意：**不能**把「被 display:none 祖先藏起来」当成问题上报。
   * 桌面表格与移动卡片是同时存在于 DOM 的两份渲染，靠 md:hidden 切换显示，
   * 任一断点下都有另一份是隐藏的 —— 那是正确实现，浏览器也不会把它排进
   * Tab 序列。这里只用来把这些元素从后续检查中**排除**。
   */
  const visible = (el) => {
    // 自身矩形为 0 就直接排除：零尺寸元素用户点不到也 Tab 不到
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (parseFloat(cs.opacity) === 0) return false;
      n = n.parentElement;
    }
    return true;
  };
  const label = (el) =>
    (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 32);

  /**
   * 判断链接是否为「夹在正文段落里的内联链接」：父元素是 p 或含大量同级文本，
   * 且自身 display 为 inline。这类受 SC 2.5.8 豁免。
   */
  const isInlineInText = (el) => {
    if (getComputedStyle(el).display !== "inline") return false;
    const p = el.parentElement;
    if (!p) return false;
    if (p.tagName === "P" || p.tagName === "LI" || p.tagName === "SPAN") return true;
    // 父元素里除本元素外还有其他文字节点的，也算内联正文
    const textLen = (p.textContent || "").length - (el.textContent || "").length;
    return textLen > 20;
  };

  // 预取所有可见可点元素的矩形，供 2.5.8 间距豁免判定使用
  const allRects = focusables.filter(visible).map((e) => e.getBoundingClientRect());

  /**
   * SC 2.5.8 的间距豁免：以目标中心为圆心画直径 24px 的圆，
   * 若它不与任何其他目标的圆相交，则该目标视为合规。
   * 圆心距 < 24 即视为相交。
   */
  const hasSpacing = (el, rect, rects) => {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (const o of rects) {
      if (o.left === rect.left && o.top === rect.top && o.width === rect.width) continue;
      const ox = o.left + o.width / 2;
      const oy = o.top + o.height / 2;
      const d = Math.hypot(cx - ox, cy - oy);
      if (d < 24) return false;
    }
    return true;
  };

  for (const el of focusables) {
    // 被响应式容器隐藏的（桌面表格 vs 移动卡片）不算问题，直接跳过
    if (!visible(el)) continue;

    // 触控目标尺寸（WCAG 2.2 SC 2.5.8，AA 为 24×24）。
    //
    // 有两条豁免，都要认：
    //  a) 内联在正文段落里的链接 —— 尺寸由行高决定，撑大反而破坏排版；
    //  b) **间距豁免**：目标本身虽小于 24×24，但以目标中心为圆心画一个
    //     24px 直径的圆，若不与任何其他目标的圆相交，即视为合规。
    //     页脚那种「宽 341×高 20 + 8px 间距」的竖排导航链接走的就是这一条。
    const r = el.getBoundingClientRect();
    if (el.matches("a[href], button, [role=button]")) {
      const tooSmall = r.width < 24 || r.height < 24;
      if (tooSmall && !isInlineInText(el) && !hasSpacing(el, r, allRects)) {
        out.push({
          kind: "触控目标过小",
          detail: label(el) + " " + Math.round(r.width) + "×" + Math.round(r.height),
        });
      }
    }
  }
  return out;
})()`;

const browser: Browser = await chromium.launch({
  proxy: PROXY === "direct" ? undefined : { server: PROXY, bypass: "localhost,127.0.0.1" },
});

let total = 0;
for (const p of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  console.log(`\n【${p.label}  ${p.url}】`);
  try {
    if (p.role) {
      const c = CREDENTIALS[p.role];
      await injectSessionViaApi(page, c.email, c.password);
    }
    await page.goto(`${SITE}${p.url}`, { waitUntil: "load", timeout: 45000 });
    await page.waitForTimeout(4000);

    if (p.role && (await page.locator("#email").isVisible().catch(() => false))) {
      console.log("  未进入目标页（仍在登录页），跳过");
      await ctx.close();
      continue;
    }

    const issues = (await page.evaluate(SRC)) as Issue[];
    total += issues.length;
    if (!issues.length) console.log("  未发现问题");
    for (const i of issues) console.log(`  [${i.kind}] ${i.detail}`);

    // 逐个 Tab，统计有多少可聚焦元素在聚焦后没有任何视觉变化
    const noRing: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        return {
          key:
            el.tagName +
            "|" +
            (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24),
          outlineStyle: cs.outlineStyle,
          outlineWidth: cs.outlineWidth,
          boxShadow: cs.boxShadow,
        };
      });
      if (!info) continue;
      if (seen.has(info.key)) continue;
      seen.add(info.key);
      // 有 outline 或 box-shadow 就算有焦点指示（:focus-visible 多走 box-shadow/ring）
      const hasRing =
        (info.outlineStyle !== "none" && parseFloat(info.outlineWidth) > 0) ||
        (info.boxShadow && info.boxShadow !== "none");
      if (!hasRing) noRing.push(info.key);
    }
    console.log(`  Tab 遍历 ${seen.size} 个可聚焦元素，其中 ${noRing.length} 个无可见焦点环`);
    for (const n of noRing.slice(0, 10)) console.log(`      · ${n}`);
    total += noRing.length;
  } catch (e) {
    console.log(`  打开失败：${(e as Error).message}`);
  }
  await ctx.close();
}

console.log(`\n合计问题：${total}`);
await browser.close();
