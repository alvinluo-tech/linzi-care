"use client";

import { q } from "@/lib/supabase/query";

/**
 * 管理端数据 API 客户端。
 *
 * 管理端所有读操作都经 /api/admin/* 在服务端以核验过的 admin 身份执行，
 * 而不是在浏览器里用当前会话直连数据库 —— 后者在共用设备上若残留非 admin
 * 会话，会让 `members` 内嵌关联被 RLS 静默置空（主要表现为「匿名客户」）。
 *
 * 返回结构与 supabase 的 { data, error } 对齐，方便各页面沿用既有写法；
 * 并复用 q() 的弱网重试（管理端读操作幂等，重试安全）。
 */
export interface AdminApiError {
  message: string;
  /** HTTP 状态码：调用方可据此区分「需要重新登录」(401) 与「权限不足」(403) */
  status: number;
}

export interface AdminApiResult<T> {
  data: T | null;
  error: AdminApiError | null;
}

export async function adminGet<T>(
  path: string,
  params?: Record<string, string | undefined>
): Promise<AdminApiResult<T>> {
  const qs = params
    ? "?" +
      new URLSearchParams(
        Object.entries(params).filter(([, v]) => v != null) as [string, string][]
      ).toString()
    : "";

  const res = await q(async () => {
    try {
      const r = await fetch(`/api/admin${path}${qs}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!r.ok) {
        let message = `请求失败（${r.status}）`;
        try {
          const body = (await r.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // 响应体非 JSON 时保留默认文案
        }
        return { data: null, error: { message, status: r.status } };
      }
      return { data: (await r.json()) as T, error: null };
    } catch (e) {
      // 网络类错误交给 q() 判断是否可重试；status 用 0 表示「未拿到响应」
      return {
        data: null,
        error: {
          message: e instanceof Error ? e.message : "网络异常",
          status: 0,
        },
      };
    }
  });

  return res as AdminApiResult<T>;
}

/**
 * 会话失效（401）时把用户送回登录页。
 * 管理端页面在取数失败时统一调用：比起让用户盯着一张空面板猜原因，
 * 直接给出去登录的路径。403 不跳转 —— 那不是登录问题，跳转会掩盖权限问题。
 */
export function redirectToLoginIfUnauthorized(error: AdminApiError | null): boolean {
  if (!error || error.status !== 401) return false;
  if (typeof window === "undefined") return false;
  const next = window.location.pathname + window.location.search;
  window.location.replace(
    `/login?next=${encodeURIComponent(next)}&reason=session-expired`
  );
  return true;
}
