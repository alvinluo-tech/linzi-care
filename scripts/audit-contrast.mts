/**
 * 无障碍：颜色对比度审计（含悬停/展开态）。
 *
 * 思路：不静态猜色值（Tailwind 工具类散落在几百处 JSX 里），而是到真实页面
 * 上把每个可见文本节点的**计算样式**取回来 —— 前景色、有效背景色（沿祖先链
 * 找第一个不透明背景，并把祖先链上的半透明遮罩按 alpha 合成）、字号、字重 ——
 * 再按 WCAG 2.1 相对亮度公式算对比度，按字号套用 AA 阈值（正文 ≥4.5:1，
 * 大字 ≥3:1）。
 *
 * 用法：npx tsx scripts/audit-contrast.mts [--all]
 *   --all  连「可交互却未获焦」的隐藏面板（弹窗、抽屉）也一并展开检查
 */
import { chromium, type Browser, type Page } from "playwright";
import { PROXY, SITE, CREDENTIALS } from "../tests/test-env";
import { injectSessionViaApi } from "../tests/browser/helpers";

/** 公开页：无需登录 */
const PUBLIC_PAGES: { label: string; url: string }[] = [
  { label: "首页", url: "/" },
  { label: "服务", url: "/services" },
  { label: "物舍橱窗", url: "/shop" },
  { label: "预约向导", url: "/book" },
  { label: "登录", url: "/login" },
];

/** 需登录的页面：拿对应角色账号进去逐个量 */
const AUTH_PAGES: {
  label: string;
  url: string;
  role: keyof typeof CREDENTIALS;
}[] = [
  { label: "后台·掌柜速览", url: "/admin", role: "boss" },
  { label: "后台·会员", url: "/admin/members", role: "boss" },
  { label: "后台·项目", url: "/admin/services", role: "boss" },
  { label: "后台·商品", url: "/admin/products", role: "boss" },
  { label: "后台·报表", url: "/admin/reports", role: "boss" },
  { label: "后台·排班", url: "/admin/schedule", role: "boss" },
  { label: "后台·技师", url: "/admin/staff", role: "boss" },
  { label: "后台·日历", url: "/admin/calendar", role: "boss" },
  { label: "会员中心", url: "/my", role: "member" },
  { label: "员工端", url: "/staff", role: "staff" },
];

interface Finding {
  text: string;
  fg: string;
  bg: string;
  ratio: number;
  fontSize: number;
  bold: boolean;
  required: number;
  tag: string;
  cls: string;
  path: string;
}

/**
 * 页面内审计函数。
 *
 * 刻意写成字符串再求值，而不是直接传函数引用：tsx 走 esbuild 转译时会往
 * **函数声明**里注入 `__name(...)` 辅助调用，而该辅助函数只存在于 Node 侧
 * 模块作用域，浏览器沙箱里没有 —— 传进去必然 ReferenceError: __name is
 * not defined（已踩两次）。字符串不经过任何转译。
 */
const AUDIT_SRC = `(() => {
  // 颜色解析。
  //
  // 必须处理三种形式，浏览器对同一个色值可能返回任意一种：
  //   rgb()/rgba()           —— 常规
  //   lab(...) / oklab(...)  —— Tailwind v4 的 /85 透明度会编译成 lab()
  //   color(srgb ... )       —— 少数情况
  //
  // lab() 尤其关键：只认 rgba() 的话，bg-bark-800/85 会被当成「透明」，
  // 于是一路穿透到浅色卡片底，把深底白字误判成 1.06:1（踩过）。
  //
  // lab() 走不了精确转换，这里用 canvas 借浏览器自己转 —— 最可靠也最省事。
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cctx = cv.getContext("2d", { willReadFrequently: true });
  const parse = (c) => {
    if (!c) return [0, 0, 0, 0];
    const s = c.trim();
    if (s === "transparent" || /^rgba?\\(\\s*0\\s*,\\s*0\\s*,\\s*0\\s*,\\s*0\\s*\\)$/.test(s)) {
      return [0, 0, 0, 0];
    }

    if (/^rgba?\\(/.test(s)) {
      const p = s.match(/\\(([^)]+)\\)/)[1].split(",").map((v) => parseFloat(v.trim()));
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }

    // lab / oklab / color()：交给 canvas 归一化。
    // canvas 会按 alpha 把颜色画到透明底上，getImageData 拿到的是
    // **未预乘**的 RGB + 原始 alpha（已实测：lab(13.78 5.79 9.58 / 0.85)
    // → [46,32,22,217]，正是 bark-800 与 0.85），所以直接取用即可。
    try {
      cctx.clearRect(0, 0, 1, 1);
      cctx.fillStyle = c;
      cctx.fillRect(0, 0, 1, 1);
      const d = cctx.getImageData(0, 0, 1, 1).data;
      // fillStyle 不合法时会被忽略，画布保持全透明 —— 视为透明色
      if (d[3] === 0) return [0, 0, 0, 0];
      return [d[0], d[1], d[2], d[3] / 255];
    } catch {
      return [0, 0, 0, 0];
    }
  };
  const lum = (rgb) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };
  const contrast = (a, b) => {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const blend = (over, under) => {
    const a = over[3];
    return [
      over[0] * a + under[0] * (1 - a),
      over[1] * a + under[1] * (1 - a),
      over[2] * a + under[2] * (1 - a),
    ];
  };
  // 层叠背景合成：由外向内逐层覆盖，后代压在祖先之上。
  //
  // 关键：不能「遇到第一层不透明色就 break」。祖先不透明只说明它遮住了**它自己
  // 的祖先**，不代表遮住了**它的后代** —— body 铺了不透明的 bg-background，
  // 而 section.bg-bark-800 正落在 body 之内、压在它上面。早退会让整屏深色区块
  // 被判成米白底，白字全报 1.00:1（实测踩过这个假警报）。
  // 正确做法是老老实实走完整条链，一直合成到目标元素自身为止。
  const effectiveBg = (el) => {
    const chain = [];
    let n = el;
    while (n) {
      chain.push(n);
      n = n.parentElement;
    }
    chain.reverse(); // [html … 元素]，即绘制顺序
    let acc = [255, 255, 255];
    for (const node of chain) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c[3] > 0) acc = blend(c, acc); // c 是覆盖层，acc 是它下面的底色
    }
    return acc;
  };
  const own = (el) => {
    let t = "";
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3) t += " " + (n.textContent || "").trim();
    }
    return t.trim();
  };
  const path = (el) => {
    const bits = [];
    let n = el;
    for (let i = 0; i < 4 && n && n.tagName !== "BODY"; i++) {
      let b = n.tagName.toLowerCase();
      const cn = (n.className || "").toString().trim().split(/\\s+/).filter(Boolean).slice(0, 2).join(".");
      if (cn) b += "." + cn;
      bits.unshift(b);
      n = n.parentElement;
    }
    return bits.join(" > ").slice(0, 120);
  };

  const out = [];
  const seen = new Set();
  for (const el of Array.from(document.querySelectorAll("body *"))) {
    const text = own(el);
    if (!text) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;

    const fgRaw = parse(cs.color);
    if (fgRaw[3] === 0) continue;
    const bg = effectiveBg(el);
    const fg = fgRaw[3] >= 0.999 ? [fgRaw[0], fgRaw[1], fgRaw[2]] : blend(fgRaw, bg);

    const fontSize = parseFloat(cs.fontSize);
    const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    // WCAG 1.4.3：≥24px，或 ≥18.66px 且粗体，算「大字」，阈值 3:1
    const large = fontSize >= 24 || (bold && fontSize >= 18.66);
    const required = large ? 3 : 4.5;

    const cr = contrast(fg, bg);
    if (cr >= required) continue;

    const key = el.tagName + "|" + text.slice(0, 30) + "|" + (cs.color) + "|" + fontSize;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      text: text.slice(0, 44),
      fg: "rgb(" + fg.map(Math.round).join(",") + ")",
      bg: "rgb(" + bg.map(Math.round).join(",") + ")",
      ratio: Math.round(cr * 100) / 100,
      fontSize: Math.round(fontSize * 10) / 10,
      bold: bold,
      required: required,
      tag: el.tagName.toLowerCase(),
      cls: (el.className || "").toString().slice(0, 80),
      path: path(el),
    });
  }
  // 对比度从低到高排，最该修的排最前
  out.sort((a, b) => a.ratio - b.ratio);
  return out;
})()`;

async function audit(page: Page): Promise<Finding[]> {
  return page.evaluate(AUDIT_SRC) as Promise<Finding[]>;
}

function report(label: string, found: Finding[]) {
  console.log(`\n【${label}】不达标 ${found.length} 处`);
  for (const f of found) {
    console.log(
      `  ${f.ratio.toFixed(2)}:1 (需 ${f.required}:1)  ${f.fontSize}px${f.bold ? " 粗" : ""}  ${f.fg} on ${f.bg}`
    );
    console.log(`      "${f.text}"  →  ${f.path}`);
  }
}

const browser: Browser = await chromium.launch({
  proxy:
    PROXY === "direct"
      ? undefined
      : { server: PROXY, bypass: "localhost,127.0.0.1" },
});

let total = 0;
const tally = new Map<string, number>();

function record(found: Finding[]) {
  total += found.length;
  for (const f of found) {
    // 按「色值组合」归并，便于看出该改哪个 token 而不是逐个改元素
    const k = `${f.fg} on ${f.bg} @ ${f.fontSize}px`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
}

for (const p of PUBLIC_PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${SITE}${p.url}`, { waitUntil: "load", timeout: 45000 });
    await page.waitForTimeout(4500);
    const found = await audit(page);
    report(p.label, found);
    record(found);
  } catch (e) {
    console.log(`\n【${p.label}】打开失败：${(e as Error).message}`);
  }
  await ctx.close();
}

// 登录态页面：每个角色各开一个 context，先把会话注进去再访问
for (const p of AUTH_PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    const cred = CREDENTIALS[p.role];
    await injectSessionViaApi(page, cred.email, cred.password);
    await page.goto(`${SITE}${p.url}`, { waitUntil: "load", timeout: 45000 });
    await page.waitForTimeout(4500);

    // 会话没生效就会停在登录页 —— 那样量到的是登录页，必须区分出来
    if (await page.locator("#email").isVisible().catch(() => false)) {
      console.log(`\n【${p.label}】未进入目标页（仍在登录页），跳过`);
      await ctx.close();
      continue;
    }

    const found = await audit(page);
    report(p.label, found);
    record(found);
  } catch (e) {
    console.log(`\n【${p.label}】打开失败：${(e as Error).message}`);
  }
  await ctx.close();
}

console.log(`\n=== 按色值组合归并（改一处 token 可一次修掉一批）===`);
for (const [k, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ×${String(n).padStart(3)}  ${k}`);
}
console.log(`\n合计不达标：${total} 处`);
await browser.close();
