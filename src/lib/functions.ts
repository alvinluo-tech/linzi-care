"use client";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/** 调用 Edge Function 并把服务端错误信息解析为可读文案 */
export async function invokeFunction<T>(
  name: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await createClient().functions.invoke(name, { body });
  if (error) {
    let message = "请求失败，请稍后再试";
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = (await error.context.json()) as { error?: string };
        message = payload?.error ?? message;
      } catch {
        // 响应体非 JSON 时保留默认文案
      }
    }
    throw new Error(message);
  }
  return data as T;
}
