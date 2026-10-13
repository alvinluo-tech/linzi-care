/**
 * 测试夹具的凭据来源（唯一入口）
 *
 * 为什么要有这个文件：此前 service_role 密钥、anon key 与三套账号口令都
 * 硬编码在 tests/ 的各 spec 里。`/tests/browser/` 虽然被 gitignore 挡在仓库外，
 * 但密钥仍然实打实地躺在每个开发者的工作区磁盘上 —— 任何一次打包、截图、
 * 「帮我看下这个文件」都会让整库沦陷（service_role 绕过全部 RLS）。
 *
 * 因此这里统一改为读环境变量，并在缺失时**明确报错**而不是静默降级：
 * 测试跑不起来是可接受的，用错凭据打生产库不是。
 *
 * 配置方式：复制 .env.example 为 .env.local 并按需填写；两者都只含占位符。
 * 运行前由 run-all.ts / playwright.config 载入。
 */
import { loadEnv } from "./load-env";

// 关键：必须在本模块**自己的顶层**载入环境文件。
// ESM 会先求值所有 import 再执行本模块语句，所以调用方写的 loadEnv() 是在
// 本模块求值**之后**才跑的 —— 靠调用方载入会读到 undefined（已实测踩到）。
loadEnv();

function required(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `缺少环境变量 ${name}。${hint}\n` +
        `请在 .env.local 中补齐（模板见 .env.example），或临时用命令行注入。`
    );
  }
  return value;
}

/** Supabase 项目地址。默认指向本地 supabase start，避免误连生产 */
export const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "http://127.0.0.1:54321";

/** 匿名 key：受 RLS 约束，泄露风险可控，但同样不入库 */
export const ANON_KEY = required(
  "SUPABASE_ANON_KEY",
  "anon key 受 RLS 约束，但仍不应硬编码进源码。"
);

/**
 * service_role key：仅用于测试数据清扫。
 * 绝不硬编码 —— 它绕过全部 RLS，等于数据库的万能钥匙。
 */
export function serviceRoleKey(): string {
  return required(
    "SUPABASE_SERVICE_ROLE_KEY",
    "service_role 可绕过全部 RLS，只能通过环境变量提供，绝不能写进源码。"
  );
}

/** 账号口令同样走环境变量：轮换口令不该需要改代码 */
export const CREDENTIALS = {
  boss: {
    email: required("E2E_ADMIN_EMAIL", "老板测试账号邮箱"),
    password: required("E2E_ADMIN_PASSWORD", "老板测试账号口令"),
  },
  staff: {
    email: required("E2E_STAFF_EMAIL", "员工测试账号邮箱"),
    password: required("E2E_STAFF_PASSWORD", "员工测试账号口令"),
  },
  member: {
    email: required("E2E_MEMBER_EMAIL", "会员测试账号邮箱"),
    password: required("E2E_MEMBER_PASSWORD", "会员测试账号口令"),
  },
};

/** 被测试站点的地址（本地 dev server） */
export const SITE = process.env.E2E_SITE ?? "http://localhost:3002";

/** 出站代理：本机直连 Supabase 常被阻断时的回退；E2E_PROXY=direct 强制直连 */
export const PROXY = process.env.E2E_PROXY ?? "http://127.0.0.1:7897";
