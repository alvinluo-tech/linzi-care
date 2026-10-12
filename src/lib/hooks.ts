"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { q } from "@/lib/supabase/query";
import { combineStoreDateTime, formatDateTime, formatTime, storeDateKey } from "@/lib/format";
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

/** 通知中心里的一条待办事项 */
export interface InboxItem {
  id: string;
  kind: "pending" | "delivery_failed" | "arrive_today";
  title: string;
  detail: string;
  /** 用于判断是否「新」：该事项的产生时间 */
  at: string;
  href: string;
}

export interface InboxState {
  items: InboxItem[];
  /** 未读条数（at > lastSeenAt）；null 表示还没算出来 */
  unread: number | null;
  loading: boolean;
  markAllSeen: () => void;
}

const INBOX_SEEN_KEY = "linzi:inbox-seen-at";

function readSeenAt(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(INBOX_SEEN_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * 老板端通知中心：聚合「需要老板动手」的三类事项，只读、不新建表。
 *
 * 为什么聚合而不是新建通知表：实时通道（Toast/声音/推送）都是瞬时的，
 * 老板离开座位再回来就错过了；缺的只是一个「错过之后能翻回来」的地方。
 * 数据源现成——待确认预约、投递失败的通知、今日待打点——无需新表与新写入路径。
 *
 * 「已读」用 localStorage 存游标：单店单老板场景足够，避免为已读状态增加迁移。
 */
export function useInbox(): InboxState {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();

    // 今日门店时区边界
    const now = new Date();
    const key = storeDateKey(now);
    const next = new Date(`${key}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const dayStartIso = combineStoreDateTime(key, "00:00");
    const dayEndIso = combineStoreDateTime(next.toISOString().slice(0, 10), "00:00");

    const [pending, failed, todayArrive] = await Promise.all([
      q(() =>
        supabase
          .from("appointments")
          .select("id, created_at, start_time, members(name), services(name)")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(20)
      ),
      q(() =>
        supabase
          .from("notifications")
          .select("id, created_at, type, channel, appointment_id")
          .eq("status", "failed")
          .order("created_at", { ascending: false })
          .limit(20)
      ),
      q(() =>
        supabase
          .from("appointments")
          .select("id, start_time, status, members(name), services(name)")
          .in("status", ["confirmed", "arrived"])
          .gte("start_time", dayStartIso)
          .lt("start_time", dayEndIso)
          .order("start_time")
          .limit(20)
      ),
    ]);

    // 任一查询失败就不更新（保留旧内容），避免把「查不到」显示成「没有待办」
    if (pending.error || failed.error || todayArrive.error) {
      setLoading(false);
      return;
    }

    const list: InboxItem[] = [];

    for (const a of (pending.data ?? []) as any[]) {
      list.push({
        id: `p-${a.id}`,
        kind: "pending",
        title: "待确认预约",
        detail: `${a.members?.name ?? "会员"} · ${a.services?.name ?? "项目"} · ${formatDateTime(
          a.start_time
        )}`,
        at: a.created_at ?? a.start_time,
        href: "/admin",
      });
    }

    for (const n of (failed.data ?? []) as any[]) {
      list.push({
        id: `f-${n.id}`,
        kind: "delivery_failed",
        title: n.type === "reminder" ? "提醒发送失败" : "确认通知发送失败",
        detail: `顾客可能没收到${n.type === "reminder" ? "到店提醒" : "确认通知"}，建议电话跟进`,
        at: n.created_at,
        href: "/admin",
      });
    }

    for (const a of (todayArrive.data ?? []) as any[]) {
      list.push({
        id: `t-${a.id}`,
        kind: "arrive_today",
        title: a.status === "arrived" ? "已到店待完成" : "今日待接待",
        detail: `${formatTime(a.start_time)} ${a.members?.name ?? "会员"} · ${
          a.services?.name ?? "项目"
        }`,
        at: a.start_time,
        href: "/admin",
      });
    }

    list.sort((x, y) => (x.at < y.at ? 1 : -1));
    setItems(list);
    const seen = readSeenAt();
    setUnread(list.filter((i) => new Date(i.at).getTime() > seen).length);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useAppointmentsChanged(() => {
    void load();
  });

  const markAllSeen = useCallback(() => {
    if (typeof window === "undefined") return;
    const newest = items.reduce(
      (max, i) => Math.max(max, new Date(i.at).getTime()),
      Date.now()
    );
    try {
      window.localStorage.setItem(INBOX_SEEN_KEY, String(newest));
    } catch {
      // ignore
    }
    setUnread(0);
  }, [items]);

  return { items, unread, loading, markAllSeen };
}
