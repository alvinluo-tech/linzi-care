"use client";

import Script from "next/script";

/**
 * Umami 访问统计（自托管 / 云端通用）。
 *
 * 站点 ID 与脚本地址都走环境变量，不硬编码在源码里：
 * - 同一个仓库要能分别连测试环境与线上环境的统计项目；
 * - 第三方标识符属于部署配置，写进代码会把「换项目」变成一次改代码 + 发版。
 *
 * 未配置 `NEXT_PUBLIC_UMAMI_WEBSITE_ID` 时**整个脚本不加载**——本地开发、
 * E2E 测试、以及没打算统计的部署都不该产生外部请求，也不该被统计污染。
 *
 * 加载策略用 afterInteractive（next/script 默认值）：统计脚本绝不能挡住
 * 首屏渲染与水合；等页面可交互后再拉取，才能既不拖慢用户、又能完整记录。
 */
export function UmamiAnalytics() {
  // trim 后再判断：.env 里多打一个空格会被当作「已配置」，从而加载一个
  // 带空 id 的统计脚本 —— 静默失效且照样发外部请求，比不配更糟。
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim();
  if (!websiteId) return null;

  // 允许换自托管实例；云端默认 cloud.umami.is
  const scriptUrl =
    process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL?.trim() ||
    "https://cloud.umami.is/script.js";

  return (
    <Script
      src={scriptUrl}
      data-website-id={websiteId}
      strategy="afterInteractive"
      defer
    />
  );
}
