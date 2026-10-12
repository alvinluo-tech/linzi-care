import type { Metadata, Viewport } from "next";
import { Geist_Mono, Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { SessionOnlyGuard } from "@/components/session-only-guard";
import "./globals.css";

// 第一性原理：中文用户只需要少数汉字字形，Google Fonts 按需切片（约 100+ 个
// unicode-range 子集），浏览器只会下载页面实际用到的切片（通常 <300KB），
// 因此这里声明全部所需字重，由 next/font 自动子集化与预加载。
const notoSansSC = Noto_Sans_SC({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  preload: true,
  fallback: ["PingFang SC", "Microsoft YaHei", "sans-serif"],
});

const notoSerifSC = Noto_Serif_SC({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  preload: true,
  fallback: ["Songti SC", "SimSun", "serif"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "林梓精养馆 · 头疗美容养生",
    template: "%s · 林梓精养馆",
  },
  description:
    "林梓精养馆线上服务平台——预约理疗项目、浏览颐养好物、管理会员资产。",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "林梓精养馆",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#3D2B1F",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${notoSansSC.variable} ${notoSerifSC.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegister />
        <SessionOnlyGuard />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
