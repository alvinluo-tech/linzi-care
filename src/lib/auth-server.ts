import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/constants";

export interface SessionInfo {
  userId: string | null;
  email: string | null;
  role: Role | null;
}

/** 给服务端到 Supabase 的请求加超时兜底：网络异常时按未登录降级，避免页面无限加载 */
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(promise).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** 服务端获取当前会话与角色（admin > staff > customer） */
export async function getCurrentSession(): Promise<SessionInfo> {
  const supabase = await createClient();

  const auth = await withTimeout(supabase.auth.getUser(), 4000);
  const user = auth?.data?.user ?? null;

  if (!user) return { userId: null, email: null, role: null };

  const rolesRes = await withTimeout(
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    4000
  );

  const roles = ((rolesRes?.data ?? []) as { role: string }[]).map(
    (r) => r.role
  );
  const role: Role | null = roles.includes("admin")
    ? "admin"
    : roles.includes("staff")
      ? "staff"
      : roles.includes("customer")
        ? "customer"
        : null;

  return { userId: user.id, email: user.email ?? null, role };
}
