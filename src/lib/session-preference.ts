"use client";

/**
 * 「保持登录」偏好
 *
 * 现状：@supabase/ssr 的 createBrowserClient 默认把会话写进 cookie，
 * 关掉浏览器再打开仍是登录态 —— 这对共用设备是个隐患：员工下机后
 * 下一个使用者打开网站直接就是员工/老板身份。
 *
 * 本模块让用户显式选择：
 *   - 勾选「保持登录」→ 会话留在 cookie，下次免登录（默认）；
 *   - 取消勾选       → 登录后清除「持久」意图，关闭标签页时自动登出。
 *
 * 实现说明：supabase-js 的存储层在 createBrowserClient 内部固定为
 * cookie + localStorage，运行时替换代价大、且会与 SSR 读 cookie 的逻辑打架。
 * 因此不替换存储，而是「默认持久 + 取消勾选时在关页前主动登出」，
 * 得到等效语义且不侵入框架。
 */

const KEEP_KEY = "linzi:keep-login";
const SESSION_ONLY_KEY = "linzi:session-only";

/** 记录用户的「保持登录」选择（true=持久，false=关页即登出） */
export function setKeepLogin(keep: boolean): void {
  if (typeof window === "undefined") return;
  try {
    // 写明确值（'1' / '0'），不用「删除键」表示 false —— 否则无法与
    // 「用户从未设置过」区分，默认值会覆盖掉用户的取消选择。
    window.localStorage.setItem(KEEP_KEY, keep ? "1" : "0");
  } catch {
    // ignore
  }
}

/** 读取「保持登录」选择；从未设置过时默认 true（免登录更符合单店日常） */
export function getKeepLogin(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEEP_KEY) !== "0";
  } catch {
    return true;
  }
}

/** 标记本次会话为「不持久」：pagehide 时据此主动登出 */
export function markSessionOnly(sessionOnly: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionOnly) window.sessionStorage.setItem(SESSION_ONLY_KEY, "1");
    else window.sessionStorage.removeItem(SESSION_ONLY_KEY);
  } catch {
    // ignore
  }
}

export function isSessionOnly(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(SESSION_ONLY_KEY) === "1";
  } catch {
    return false;
  }
}
