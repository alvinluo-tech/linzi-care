require("../load-env.ts");
const { chromium } = require("playwright");

(async () => {
  const email = process.env.E2E_MEMBER_EMAIL;
  const password = process.env.E2E_MEMBER_PASSWORD;
  if (!email || !password) {
    console.error(
      "缺少 E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD（见 .env.example）。" +
        "凭据不再硬编码进源码。"
    );
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    proxy: { server: "http://127.0.0.1:7897", bypass: "localhost,127.0.0.1" },
  });
  const page = await browser.newPage();
  page.on("response", (res) => {
    if (res.url().includes("supabase")) console.log("  [NET]", res.status(), res.url().slice(0, 90));
  });
  page.on("requestfailed", (req) => {
    if (req.url().includes("supabase")) console.log("  [FAIL]", req.failure()?.errorText, req.url().slice(0, 90));
  });
  await page.goto("http://localhost:3002/login");
  await page.waitForTimeout(1500);
  await page.fill("#email", email);
  await page.fill("#password", password);
  const t0 = Date.now();
  await page.getByRole("button", { name: "登 录" }).click();
  try {
    await page.waitForURL("**/my", { timeout: 30000 });
    console.log("OK login redirect in", Date.now() - t0, "ms");
  } catch {
    console.log("FAIL no redirect in 30s. URL:", page.url());
  }
  await browser.close();
})();
