import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
