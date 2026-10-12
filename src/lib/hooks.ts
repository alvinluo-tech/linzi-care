"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { q } from "@/lib/supabase/query";
import type { Role } from "@/lib/constants";

export interface AuthState {
  loading: boolean;
  user: User | null;
  role: Role | null;
  /** 身份/角色问不出来（网络或查询失败）。调用方不能据此判定权限，更不能当成未登录。 */
  unavailable: boolean;
}

const INITIAL: AuthState = {
  loading: true,
  user: null,
  role: null,
  unavailable: false,
};

function pickRole(roles: string[]): Role | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("staff")) return "staff";
  if (roles.includes("customer")) return "customer";
  return null;
}

async function readSession(): Promise<AuthState> {
  const supabase = createClient();

  const { data, error: authError } = await supabase.auth.getUser();
  if (authError) return { loading: false, user: null, role: null, unavailable: true };

  const user = data.user;
  if (!user) return { loading: false, user: null, role: null, unavailable: false };

  const { data: rolesData, error: rolesError } = await q(() =>
    supabase.from("user_roles").select("role").eq("user_id", user.id)
  );
  if (rolesError) return { loading: false, user, role: null, unavailable: true };

  const roles = (rolesData ?? []).map((r) => r.role as string);
  return { loading: false, user, role: pickRole(roles), unavailable: false };
}

/** 浏览器端获取当前会话与角色，并在登录态变化时重新同步 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const apply = (next: AuthState) => {
      if (!cancelled) setState(next);
    };

    void readSession().then(apply);

    // 登出/换账号会发生在别的组件里：不订阅就会一直显示旧的登录态
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void readSession().then(apply);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export const APPOINTMENTS_CHANGED_EVENT = "appointments:changed";

/**
 * 广播「预约数据已变更」。
 * 本机操作（确认接单/取消/代客预约）成功后必须调用：订阅者（如导航角标）
 * 需要立即重取数据，不能等 Realtime 回环——网络抖动时回环可能迟迟不到，
 * 会留下"已确认但角标不归零"的错觉。远端变更由 RealtimeNotifier 代发同一信号。
 */
export function broadcastAppointmentsChanged() {
  window.dispatchEvent(new CustomEvent(APPOINTMENTS_CHANGED_EVENT));
}

/** 订阅由管理端广播的预约变更事件（本机操作与 Realtime 远端事件统一走此信号） */
export function useAppointmentsChanged(callback: () => void) {
  const ref = useRef(callback);

  useEffect(() => {
    ref.current = callback;
  }, [callback]);

  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(APPOINTMENTS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(APPOINTMENTS_CHANGED_EVENT, handler);
  }, []);
}

/**
 * 待确认预约的实时计数（导航角标用）。
 * 数据源与 RealtimeNotifier 的广播事件复用同一条链路：任何 INSERT/UPDATE/DELETE
 * 都会触发刷新，因此无需再开一条 Realtime 订阅。
 * 返回 null 表示"还没问出来"（加载中或查询失败）——此时角标不渲染，绝不显示错误的 0。
 */
export function usePendingCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const res = await q(() =>
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
    );
    if (!res.error) setCount(res.count ?? 0);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useAppointmentsChanged(() => {
    void load();
  });

  return count;
}
