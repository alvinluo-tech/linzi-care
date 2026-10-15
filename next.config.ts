import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  /**
   * 构建产物目录。默认 .next；这里允许用环境变量临时改到别处。
   *
   * 为什么需要这个开关：Windows 上 .next/server/route-cache 里偶尔会残留一个
   * 带 `$` 的目录，其下的文件会变成「删不掉」状态（cmd rd / PowerShell
   * Remove-Item / Node fs.rmSync 全部报 EPERM，且找不到持有句柄的进程），
   * 导致整个 .next 无法清理、构建直接失败。此时换一个干净目录即可继续，
   * 不必和文件系统较劲。
   *
   *   set NEXT_DIST_DIR=.next-verify && npx next build
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  images: {
    /**
     * 商品图由老板在后台直接填外链 URL，域名事先不可知（微信图床、淘宝、
     * 自建对象存储……），因此无法枚举 remotePatterns。这里放行任意 HTTPS
     * 来源，仅拦下明文 HTTP（混合内容会被浏览器直接拦掉，且不安全）。
     *
     * 换来的是 next/image 的自动能力：按容器尺寸生成合适宽度、WebP/AVIF
     * 转码、懒加载与布局占位（避免图片加载时的跳动）。
     *
     * 安全边界：这是**渲染图片**，不是把远端内容当代码执行。风险面是老板
     * 填了恶意 URL 时由服务端去拉取（SSRF）。后台仅老板可写，属可信输入，接受。
     */
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
