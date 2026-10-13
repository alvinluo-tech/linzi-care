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
 * 单次查询的硬超时。
 *
 * 为什么必须显式设超时：fetch 在网络半开（TCP 已连上、服务端迟迟不回）时
 * **既不 resolve 也不 reject**，会一直挂着。此时下面这层「按 error 重试」的
 * 逻辑根本不会被触发 —— 连 `await build()` 都回不来 —— 结果是页面永远停在
 * loading。这不是重试能解决的问题，是自己给自己设一个上限。
 *
 * 取 8s：远高于正常 PostgREST 响应（本地实测多在 100ms 量级），低于用户
 * 开始怀疑"卡死了"的阈值（约 10s）。
 */
const TIMEOUT_MS = 8000;

/**
 * 给一次异步查询套上超时。
 * 超时以抛出 AbortError 的形式返回，这样它能自然融入既有的重试判定
 * （RETRYABLE 里已有 "aborted"），而不是被当成一个需要特判的新分支。
 */
async function withTimeout<R>(build: () => PromiseLike<R>): Promise<R> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(
        `查询超时：${TIMEOUT_MS}ms 内未收到响应（网络可能中断）`
      );
      err.name = "AbortError";
      reject(err);
    }, TIMEOUT_MS);
  });

  try {
    return await Promise.race([Promise.resolve(build()), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

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
  let lastHang: Error | null = null;

  for (let i = 1; i <= attempts; i++) {
    let res: R;
    try {
      res = await withTimeout(build);
    } catch (e) {
      // 超时/网络中断：这里只在最后一次才放弃，否则继续重试
      lastHang = e instanceof Error ? e : new Error(String(e));
      if (i === attempts) break;
      await new Promise((r) => setTimeout(r, baseDelayMs * i));
      continue;
    }

    if (!res.error) return res;
    last = res;

    const msg = (res.error.message || "").toLowerCase();
    const retriable = RETRYABLE.some((k) => msg.includes(k));
    if (!retriable || i === attempts) return res;
    await new Promise((r) => setTimeout(r, baseDelayMs * i));
  }

  // 全部尝试都超时：合成一个与 PostgREST 同构的结果，交给调用方按既有
  // error 分支处理（页面显示"加载失败"而不是无限转圈）。
  if (last) return last;
  return {
    data: null,
    error: {
      message: lastHang?.message ?? "查询失败：网络无响应",
    },
  } as unknown as R;
}

export type TypedClient = SupabaseClient<Database>;

/**
 * 写操作执行器：**绝不重试**。
 * PostgREST 的 insert/update/delete 与 RPC 副作用都不幂等——请求已提交但响应在网络层
 * 丢失时，重放会产生重复业务行或重复 balance_logs 账本行。这类失败应直接回传给用户，
 * 由用户决定是否再点一次。
 */
export async function mutate<
  R extends { data: unknown; error: { message: string } | null },
>(build: () => PromiseLike<R>): Promise<R> {
  return await build();
}
