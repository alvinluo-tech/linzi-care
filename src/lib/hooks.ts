"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { adminGet } from "@/lib/admin/client";
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
 * 响应式媒体查询，用于「同一个组件要在不同断点挂到不同容器」的场景。
 *
 * 为什么不直接用 CSS 的 `hidden md:flex`：CSS 隐藏的元素**依然会挂载**。
 * 管理端的通知铃铛原先把同一份组件放在侧边栏与手机顶栏两处，靠 CSS 保证
 * 只看见一个 —— 结果两个实例都在跑，各自请求一次聚合接口并开一条 Realtime
 * 订阅。用本 hook 决定「挂哪一个」后，任何时刻只有一个实例存在。
 *
 * 用 useSyncExternalStore 而非 useEffect + setState：matchMedia 就是一个
 * 外部订阅源，正是这个 API 的适用场景 —— 它能在首次渲染就给出正确值，
 * 不会像 effect 那样先渲染一遍旧值再纠正（那会造成闪烁与多余渲染）。
 *
 * 服务端快照固定返回 false：服务端拿不到视口宽度。默认 false 让首帧偏保守
 * （渲染手机布局），客户端水合后立即纠正为真实值。
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
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
    // 走服务端 admin 身份：角标必须反映全店待确认数，不能被非 admin 会话
    // 的 RLS 裁剪成 0（那会让老板以为没有待办）。
    const res = await adminGet<{ count: number; error?: string }>("/pending-count");
    if (!res.error) setCount(res.data?.count ?? 0);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 该规则不追踪 async 边界：下面调用的 load() 首个动作就是 await 网络请求，setState 发生在 await 之后，非同步级联渲染。
    void load();
  }, [load]);

  useAppointmentsChanged(() => {
    void load();
  });

  return count;
}

/** 通知中心聚合查询返回的行形状（只取用到的字段，避免 select * ） */
interface InboxPendingRow {
  id: string;
  created_at: string | null;
  start_time: string;
  members: { name: string | null } | null;
  services: { name: string | null } | null;
}
interface InboxFailedRow {
  id: string;
  created_at: string;
  type: string;
  appointment_id: string | null;
}
interface InboxTodayRow {
  id: string;
  start_time: string;
  status: string;
  members: { name: string | null } | null;
  services: { name: string | null } | null;
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
  /** 关联的预约单号（若有）。供「点开直接办」定位到具体那一单。 */
  appointmentId: string | null;
}

export interface InboxState {
  items: InboxItem[];
  /** 未读条数（at > lastSeenAt）；null 表示还没算出来 */
  unread: number | null;
  loading: boolean;
  /**
   * 把「看过就算」的事项标记为已读。
   * 待确认预约是「办完才算」，不在此列 —— 见 SEENABLE_KINDS 的注释。
   */
  markSeen: () => void;
  /** 立即重取待办列表。在通知中心里就地办完一单后调用，让该条立刻消失。 */
  refresh: () => void;
}

const INBOX_SEEN_KEY = "linzi:inbox-seen-at";

/**
 * 未读的判定分两类，这是通知中心最关键的一条规则：
 *
 * - `pending`（待确认预约）**永远算未读**，与「看没看过」无关。它只在老板
 *   真正办完（确认/取消）后，因离开 pending 状态而从数据源消失，才自然归零。
 *   若让「打开面板」把它标成已读，老板瞟一眼、没接单，这单就再也不会提醒
 *   —— 而它是唯一有时效性、漏掉会直接伤到顾客体验的一类。
 *
 * - 其余两类（今日到店、投递失败）看过就算：老板知道就行，不会再因为
 *   「没看」产生后果，用 localStorage 游标记住上次看到的时间即可。
 */
function isUnread(item: InboxItem, seenAt: number): boolean {
  if (item.kind === "pending") return true;
  return new Date(item.at).getTime() > seenAt;
}

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
  const [loading, setLoading] = useState(true);

  /**
   * 已读游标放进 state：markSeen 更新它之后要立刻重算未读条数，
   * 只写 localStorage 不会触发重渲染，角标会停在旧数字上。
   *
   * **必须留在 effect 里，不能用惰性初始化器**：服务端无 window → 读到 0，
   * 客户端读到用户真实存过的游标值，两者不同 → 水合不匹配（React #418）。
   * 这与 login-form 是同一个坑，两处都实测踩过。
   */
  const [seenAt, setSeenAt] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 只能在客户端读；放进惰性初始化器会水合失败（React #418）
    setSeenAt(readSeenAt());
  }, []);

  const load = useCallback(async () => {
    // 今日门店时区边界
    const now = new Date();
    const key = storeDateKey(now);
    const next = new Date(`${key}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const dayStartIso = combineStoreDateTime(key, "00:00");
    const dayEndIso = combineStoreDateTime(next.toISOString().slice(0, 10), "00:00");

    // 经服务端 admin 身份读取：待确认/今日客单都内嵌 members(name)，
    // 客户端若持非 admin 会话会被 RLS 静默置空（显示成「会员」）。
    const res = await adminGet<{
      pending: InboxPendingRow[];
      failedNotifications: InboxFailedRow[];
      todayArrive: InboxTodayRow[];
      error?: string;
    }>("/inbox", { day_start: dayStartIso, day_end: dayEndIso });

    // 查询失败就不更新（保留旧内容），避免把「查不到」显示成「没有待办」
    if (res.error) {
      setLoading(false);
      return;
    }

    const payload = res.data!;
    const list: InboxItem[] = [];

    for (const a of payload.pending ?? []) {
      list.push({
        id: `p-${a.id}`,
        kind: "pending",
        title: "待确认预约",
        detail: `${a.members?.name ?? "会员"} · ${a.services?.name ?? "项目"} · ${formatDateTime(
          a.start_time
        )}`,
        at: a.created_at ?? a.start_time,
        href: "/admin",
        appointmentId: a.id,
      });
    }

    for (const n of payload.failedNotifications ?? []) {
      list.push({
        id: `f-${n.id}`,
        kind: "delivery_failed",
        title: n.type === "reminder" ? "提醒发送失败" : "确认通知发送失败",
        detail: `顾客可能没收到${n.type === "reminder" ? "到店提醒" : "确认通知"}，建议电话跟进`,
        at: n.created_at,
        href: "/admin",
        appointmentId: n.appointment_id,
      });
    }

    for (const a of payload.todayArrive ?? []) {
      list.push({
        id: `t-${a.id}`,
        kind: "arrive_today",
        title: a.status === "arrived" ? "已到店待完成" : "今日待接待",
        detail: `${formatTime(a.start_time)} ${a.members?.name ?? "会员"} · ${
          a.services?.name ?? "项目"
        }`,
        at: a.start_time,
        href: "/admin",
        appointmentId: a.id,
      });
    }

    list.sort((x, y) => (x.at < y.at ? 1 : -1));
    setItems(list);
    setLoading(false);
  }, []);

  /**
   * 未读条数是**派生值**，直接用 useMemo 算，不放进 effect + setState。
   *
   * 原先写成 useEffect(() => { if (!loading) setUnread(count) }, [items, seenAt, loading])：
   * 那会多跑一轮渲染（items 变了 → 渲染 → effect 里 setUnread → 再渲染），
   * 而且中间那一帧角标数字是旧的。派生状态就该在渲染期算出来。
   * loading 期间返回 null（而不是 0），让角标不渲染数字而非显示错误的 0。
   */
  const unread = useMemo(
    () => (loading ? null : items.filter((i) => isUnread(i, seenAt)).length),
    [items, seenAt, loading]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 该规则不追踪 async 边界：下面调用的 load() 首个动作就是 await 网络请求，setState 发生在 await 之后，非同步级联渲染。
    void load();
  }, [load]);

  useAppointmentsChanged(() => {
    void load();
  });

  const markSeen = useCallback(() => {
    if (typeof window === "undefined") return;
    // 只对「看过就算」的那类推进游标；pending 不参与，见 isUnread 的说明。
    const newestSeenable = items.reduce((max, i) => {
      if (i.kind === "pending") return max;
      return Math.max(max, new Date(i.at).getTime());
    }, 0);
    if (newestSeenable === 0) return;
    try {
      window.localStorage.setItem(INBOX_SEEN_KEY, String(newestSeenable));
    } catch {
      // ignore
    }
    setSeenAt(newestSeenable);
  }, [items]);

  return { items, unread, loading, markSeen, refresh: () => void load() };
}
