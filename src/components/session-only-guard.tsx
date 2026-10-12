"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSessionOnly } from "@/lib/session-preference";

/**
 * 「关页即登出」执行器。
 *
 * 登录页在用户取消「保持登录」时写入 session-only 标记；本组件在应用根部
 * 监听 pagehide —— 若标记存在且这是最后一次卸载，就清除 Supabase 会话。
 *
 * 为什么用 pagehide 而不是 beforeunload：iOS Safari（本店主要终端）对
 * beforeunload 支持很差，pagehide 才是移动端可靠的卸载事件。
 * 登出是异步的，卸载时无法等待完成，故只能发起请求；Supabase 的
 * signOut 会清本地存储，即使请求未及送达也已移除本机凭证。
 */
export function SessionOnlyGuard() {
  useEffect(() => {
    const onHide = () => {
      if (!isSessionOnly()) return;
      // 不清除 marker：同一标签页内若返回，应继续保持「不持久」语义
      void createClient().auth.signOut();
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  return null;
}
