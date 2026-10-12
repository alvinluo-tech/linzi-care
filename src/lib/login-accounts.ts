"use client";

/**
 * 登录便捷性存储（仅存账号，绝不存密码）
 *
 * 安全前提：这是「老板 + 员工共用平板/电脑」的场景。把密码（哪怕混淆过）
 * 写进浏览器存储，等于把能调整余额的账号交给任何拿到这台设备的人。
 * 因此这里的职责边界是：
 *   - 记住「登录状态」交给 Supabase 会话（cookie/localStorage），已由框架实现；
 *   - 我们只额外记住「最近登录过的邮箱」，用于一键回填账号；
 *   - 密码永远不落盘，由浏览器自带的密码管理器（用户授权后）负责。
 */

const ACCOUNTS_KEY = "linzi:login-accounts";
const MAX_ACCOUNTS = 5;

export interface RememberedAccount {
  email: string;
  /** 上次登录成功的时间戳（毫秒） */
  lastUsedAt: number;
}

/** 读取最近登录账号（按最近使用排序，去重） */
export function loadRememberedAccounts(): RememberedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (a): a is RememberedAccount =>
          !!a &&
          typeof (a as RememberedAccount).email === "string" &&
          typeof (a as RememberedAccount).lastUsedAt === "number"
      )
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .slice(0, MAX_ACCOUNTS);
  } catch {
    return [];
  }
}

/** 记录一次成功登录的账号（邮箱大小写归一后去重） */
export function rememberAccount(email: string): void {
  if (typeof window === "undefined") return;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  try {
    const existing = loadRememberedAccounts().filter(
      (a) => a.email.toLowerCase() !== normalized
    );
    const next: RememberedAccount[] = [
      { email: normalized, lastUsedAt: Date.now() },
      ...existing,
    ].slice(0, MAX_ACCOUNTS);
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
  } catch {
    // 隐私模式等场景下 localStorage 不可写：静默降级，不影响登录主流程
  }
}

/** 从历史账号中移除一个（用户主动删除） */
export function forgetAccount(email: string): void {
  if (typeof window === "undefined") return;
  try {
    const normalized = email.trim().toLowerCase();
    const next = loadRememberedAccounts().filter(
      (a) => a.email.toLowerCase() !== normalized
    );
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/** 清空全部历史账号 */
export function clearRememberedAccounts(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACCOUNTS_KEY);
  } catch {
    // ignore
  }
}
