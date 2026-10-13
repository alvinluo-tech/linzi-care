/**
 * 启动自检：用真实浏览器确认页面数据真的渲染出来了。
 *
 * 上一版探针用 curl 抓 HTML 判断服务名，结论是错的 —— /services 的列表是
 * 客户端取数，服务端渲染出的只是外壳与静态文案（所以能看到「加载」字样）。
 * 数据渲染必须靠真实浏览器才判得准。
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3000";
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
      (found.length ? `  例: ${found.slice(0, 3).join(" / ")}` : "")
  );
  return ok;
}

console.log("=== 真实浏览器渲染自检 ===\n");

const results: boolean[] = [];

results.push(
  await checkPage("/services", "服务价目", [
    "姜汤头疗",
    "精油开背",
    "基础泡浴",
    "悠然采耳",
    "拔罐",
  ])
);

results.push(
  await checkPage("/shop", "颐养商城", ["商城", "商品"])
);

results.push(
  await checkPage("/book", "预约向导", ["择", "技师"])
);

// 首页同样有数据驱动区块
results.push(await checkPage("/", "首页", ["林梓", "服务", "预约"]));

console.log(`\n未捕获 JS 异常: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log("  " + e);

// 冒烟：首页不该有横向溢出
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
