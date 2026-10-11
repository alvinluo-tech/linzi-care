import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

export type QueryResult<T> = {
  data: T;
  error: { message: string } | null;
  count?: number | null;
  status?: number;
  statusText?: string;
};

const RETRYABLE = [
  "fetch",
  "network",
  "timeout",
  "econn",
  "socket",
  "aborted",
  "interrupted",
];

/**
 * 带重试的查询执行器（第一性原理：移动网络下单次 fetch 失败是常态，
 * 「查询失败」必须重试，而不是把空数组当「没有数据」展示给用户）。
 *
 * 保留 PostgREST 的完整响应结构（包括 count、status 等元数据）。
 */
export async function q<R extends { data: unknown; error: { message: string } | null }>(
  build: () => PromiseLike<R>,
  attempts = 3,
  baseDelayMs = 600
): Promise<R> {
  let last: R | null = null;
  for (let i = 1; i <= attempts; i++) {
    const res = await build();
    if (!res.error) return res;
    last = res;
    const msg = (res.error.message || "").toLowerCase();
    const retriable = RETRYABLE.some((k) => msg.includes(k));
    if (!retriable || i === attempts) return res;
    await new Promise((r) => setTimeout(r, baseDelayMs * i));
  }
  return last!;
}

export type TypedClient = SupabaseClient<Database>;
