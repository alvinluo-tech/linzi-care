import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

/**
 * 管理端数据访问层（DAL）
 *
 * 背景：`/admin` 的服务端布局已核验 admin 身份，但页面原先在浏览器里用
 * supabase-js + 当前 cookie 会话取数。共用设备上若残留的是员工/顾客会话
 * （或 dev/prod 双服务 shared-cookie 导致 refresh token 轮换错位），
 * 浏览器请求就会以非 admin 身份发出 —— 而 `appointments` 的 SELECT 策略
 * 明确允许 staff 读「分配给自己」的单子，于是预约行读得到，但它内嵌的
 * `members` 关联会被 members 表 RLS 静默过滤成 null
 * （该策略仅放行 `user_id = auth.uid() OR has_role('admin')`）。
 * 前端 `a.members?.name ?? "匿名客户"` 便把「读不到客户」显示成了「匿名客户」，
 * 不报错、不告警，静默给出错误内容。
 *
 * 修复思路：管理端取数一律走服务端。服务端用**同一个 cookie 会话**核验身份
 * （与 admin 布局守卫同源），确认是 admin 后，再以该身份查询 —— 此时 members
 * 的 RLS 放行，内嵌关联不再被置空。
 *
 * 关键点：若调用者不是 admin，我们**显式返回 403**，而不是让页面退回
 * 客户端会话去查。这样「权限不对」会变成一条清晰的错误，而不是伪装成
 * 「匿名客户」的静默错误数据。
 */

export type AdminCheck =
  | { ok: true; userId: string; email: string | null; supabase: SupabaseClient<Database> }
  | { ok: false; status: number; error: string };

/** 核验当前请求携带的会话是否为已登录的 admin，成功则连同一个可用的服务端客户端返回 */
export async function requireAdmin(): Promise<AdminCheck> {
  const supabase = await createClient();

  // getUser() 会向 Supabase 发一次网络请求来校验 token。三种结果必须区分开：
  //   1. 取不到会话（没带 cookie / 会话结构缺失）—— 这是「未登录」，401；
  //   2. 带了会话但服务端判为无效（status 401）—— 同样是「请重新登录」，401；
  //   3. 网络抖动 / 超时 / 5xx —— 会话可能完全正常，不能谎报失效把人踢出去，应报 503。
  // 三者原先都落到同一个 401，导致一次抖动就把已登录的掌柜登出。
  const retriable = (e: { status?: number; code?: string; name?: string } | null) => {
    if (!e) return false;
    if (e.status === 401) return false;                 // 明确的未授权：重试无意义
    if (e.code === "session_missing") return false;     // 压根没带会话：同样不该重试
    if (e.name === "AuthSessionMissingError") return false;
    return true;                                        // 其余（网络/超时/5xx）值得重试
  };

  let auth = await supabase.auth.getUser();
  for (let i = 0; i < 2 && retriable(auth.error); i++) {
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    auth = await supabase.auth.getUser();
  }

  const { data, error: authError } = auth;
  if (authError) {
    const missingSession =
      authError.code === "session_missing" ||
      authError.name === "AuthSessionMissingError";
    const unauthorized = authError.status === 401;
    if (missingSession || unauthorized) {
      return { ok: false, status: 401, error: "未登录或会话已失效，请重新登录" };
    }
    return { ok: false, status: 503, error: "暂时无法校验登录状态，请稍后重试" };
  }
  if (!data.user) {
    return { ok: false, status: 401, error: "未登录或会话已失效，请重新登录" };
  }

  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  if (rolesError) {
    return { ok: false, status: 503, error: "角色校验失败，请稍后重试" };
  }

  const isAdmin = (roles ?? []).some((r) => r.role === "admin");
  if (!isAdmin) {
    return { ok: false, status: 403, error: "当前登录身份不是老板，无法读取管理端数据" };
  }

  return {
    ok: true,
    userId: data.user.id,
    email: data.user.email ?? null,
    supabase,
  };
}
