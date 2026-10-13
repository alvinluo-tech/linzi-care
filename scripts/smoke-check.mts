/**
 * 启动自检：用真实浏览器确认页面数据真的渲染出来了。
 *
 * 为什么不能只看 HTTP 状态码：/services 等页面的列表是客户端取数，
 * 服务端渲染出的只是外壳与静态文案。客户端 bundle 若没正常初始化，
 * 页面照样返回 200，却只剩加载骨架 —— 状态码完全看不出区别。
 *
 * ⚠ 必须用 localhost 访问，不能用 127.0.0.1。
 * Next 16 默认阻止未列入 allowedDevOrigins 的来源访问 dev 资源；
 * 用 IP 访问时客户端 bundle 不初始化、不发出任何查询请求，
 * 所有数据页都停在骨架态 —— 看起来就像应用坏了。
 * （实测：localhost 渲染 20 个服务项、PostgREST 返回 200；
 *   127.0.0.1 则零请求、零数据。差异纯粹来自主机名。）
 */
import { chromium } from "playwright";

// 可用 SMOKE_BASE 覆盖（例如指到 next start 的 3002 端口）
const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function checkPage(path: string, label: string, expectText: string[]) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  const body = await page.innerText("body");
  const found = expectText.filter((t) => body.includes(t));
  const ok = found.length > 0;
  console.log(
    `${ok ? "✓" : "✗"} ${label.padEnd(12)} 命中 ${found.length}/${expectText.length} 条真实数据` +
      (found.length ? `  例: ${found.slice(0, 3).join(" / ")}` : "  ⚠ 疑似停在加载态")
  );
  return ok;
}

console.log(`=== 启动自检 ${BASE} ===\n`);

const results: boolean[] = [];

results.push(
  await checkPage("/services", "服务价目", [
    "姜汤头疗",
    "精油开背",
    "基础泡浴",
    "悠然采耳",
  ])
);

results.push(await checkPage("/shop", "颐养商城", ["商城", "商品"]));
results.push(await checkPage("/book", "预约向导", ["择", "技师"]));
results.push(await checkPage("/", "首页", ["林梓", "服务", "预约"]));

console.log(`\n未捕获 JS 异常: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log("  " + e);

await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const layout = await page.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
}));
const noOverflow = layout.scrollW <= layout.clientW + 1;
console.log(
  `${noOverflow ? "✓" : "✗"} 无横向溢出   scrollWidth=${layout.scrollW} clientWidth=${layout.clientW}`
);
results.push(noOverflow);

await browser.close();

const pass = results.filter(Boolean).length;
console.log(`\n结果：${pass} / ${results.length} 项通过`);
process.exit(pass === results.length && errors.length === 0 ? 0 : 1);
