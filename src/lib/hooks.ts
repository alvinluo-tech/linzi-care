"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/constants";

export interface AuthState {
  loading: boolean;
  user: User | null;
  role: Role | null;
}

/** 浏览器端获取当前会话与角色 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    loading: true,
    user: null,
    role: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) setState({ loading: false, user: null, role: null });
        return;
      }

      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const roles = (rolesData ?? []).map((r) => r.role as string);
      const role: Role | null = roles.includes("admin")
        ? "admin"
        : roles.includes("staff")
          ? "staff"
          : roles.includes("customer")
            ? "customer"
            : null;

      if (!cancelled) setState({ loading: false, user, role });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export const APPOINTMENTS_CHANGED_EVENT = "appointments:changed";

/** 订阅由管理端 Realtime 广播的预约变更事件 */
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
