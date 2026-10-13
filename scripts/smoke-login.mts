/**
 * 确认三种角色都能真正登录并进入各自控制台。
 * 这一步专门验证「服务端出站代理」是否生效 —— 管理端页面在服务端核验身份，
 * 服务端拨不通 Supabase 时会渲染空壳（HTTP 仍是 200）。
 */
import { chromium } from "playwright";
import { loadEnv } from "../tests/load-env";

loadEnv();

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";

const accounts = [
  {
    label: "老板",
    email: process.env.E2E_ADMIN_EMAIL!,
    pw: process.env.E2E_ADMIN_PASSWORD!,
    expect: "/admin",
    // 管理端首页的固定文案
    markers: ["掌柜", "待确认"],
  },
  {
    label: "员工",
    email: process.env.E2E_STAFF_EMAIL!,
    pw: process.env.E2E_STAFF_PASSWORD!,
    expect: "/staff",
    // 员工端渲染自己的一周排班：用「星期 + 营业时段」判定确实拿到了数据，
    // 而不是页面空壳（空壳同样会落到 /staff 且返回 200）
    markers: ["周", "10:00"],
  },
  {
    label: "会员",
    email: process.env.E2E_MEMBER_EMAIL!,
    pw: process.env.E2E_MEMBER_PASSWORD!,
    expect: "/my",
    markers: ["会籍"],
  },
];

const browser = await chromium.launch({ headless: true });
let pass = 0;
let fail = 0;

for (const a of accounts) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.fill("#email", a.email);
    await page.fill("#password", a.pw);
    await page.getByRole("button", { name: "登 录" }).click();

    await page.waitForURL(`**${a.expect}**`, { timeout: 30000 });
    await page.waitForTimeout(2500);

    const body = await page.innerText("body");
    const hit = a.markers.filter((m) => body.includes(m));
    const url = new URL(page.url()).pathname;

    // 判定标准有两条：落在正确的控制台，且正文里出现了数据驱动的内容。
    // 只查 URL 不够 —— 服务端出站不通时页面照样 200，但会是空壳。
    if (url.startsWith(a.expect) && hit.length > 0) {
      console.log(
        `✓ ${a.label}  登录 → ${url}  命中「${hit.join(" / ")}」(${body.length} 字节)`
      );
      pass++;
    } else {
      console.log(
        `✗ ${a.label}  落在 ${url}（期望 ${a.expect}），` +
          `命中标记 ${hit.length}/${a.markers.length}，正文 ${body.length} 字节`
      );
      fail++;
    }
  } catch (e) {
    console.log(`✗ ${a.label}  ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    fail++;
  } finally {
    await ctx.close();
  }
}

await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
