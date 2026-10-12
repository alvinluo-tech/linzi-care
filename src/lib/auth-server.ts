import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/constants";

export type SessionStatus = "ok" | "anonymous" | "unavailable";

export interface SessionInfo {
  /**
   * `ok` 已确认身份；`anonymous` 确认未登录（凭证本身无效）；
   * `unavailable` 无法判定（网络抖动/超时/角色查询失败）——此时绝不能把用户踢到登录页。
   */
  status: SessionStatus;
  userId: string | null;
  email: string | null;
  role: Role | null;
  detail: string | null;
}

const TIMEOUT_MS = 4000;
const ATTEMPTS = 3;

const NETWORK_MARKERS = [
  "fetch",
  "network",
  "timeout",
  "econn",
  "socket",
  "aborted",
  "interrupted",
  "temporarily",
  "unavailable",
];

/** 超时后清除定时器：不留悬挂句柄，也不吞掉异常来源 */
function withTimeout<T>(task: () => PromiseLike<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    Promise.resolve()
      .then(task)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

function isTransient(message: string): boolean {
  const m = (message || "").toLowerCase();
  return NETWORK_MARKERS.some((k) => m.includes(k));
}

const ANONYMOUS: SessionInfo = {
  status: "anonymous",
  userId: null,
  email: null,
  role: null,
  detail: null,
};

function pickRole(roles: string[]): Role | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("staff")) return "staff";
  if (roles.includes("customer")) return "customer";
  return null;
}

/** 服务端获取当前会话与角色（admin > staff > customer），并区分「未登录」与「问不出结果」 */
export async function getCurrentSession(): Promise<SessionInfo> {
  let detail = "会话校验失败";

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const supabase = await createClient();

    const auth = await withTimeout(() => supabase.auth.getUser(), TIMEOUT_MS);

    if (auth === null) {
      detail = "会话校验超时";
    } else if (auth.error) {
      // 凭证本身无效（过期/签名不符）才是真的未登录；网络类错误要重试并最终如实上报
      if (!isTransient(auth.error.message)) return ANONYMOUS;
      detail = auth.error.message;
    } else if (!auth.data.user) {
      return ANONYMOUS;
    } else {
      const user = auth.data.user;
      const rolesRes = await withTimeout(
        () => supabase.from("user_roles").select("role").eq("user_id", user.id),
        TIMEOUT_MS
      );

      if (rolesRes === null) {
        detail = "角色查询超时";
      } else if (rolesRes.error) {
        // 角色读不出来不等于「没有角色」：回落成 customer 会把老板送进会员区
        detail = rolesRes.error.message;
      } else {
        const roles = ((rolesRes.data ?? []) as { role: string }[]).map((r) => r.role);
        return {
          status: "ok",
          userId: user.id,
          email: user.email ?? null,
          role: pickRole(roles),
          detail: null,
        };
      }
    }

    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 300 * attempt));
  }

  return { status: "unavailable", userId: null, email: null, role: null, detail };
}
