import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { json } from "../_shared/cors.ts";

/** service_role 客户端：仅存在于 Edge Function 服务端，绝不下发前端 */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export type AdminCheck =
  | { ok: true; callerId: string | null }
  | { ok: false; response: Response };

/**
 * 校验调用者是老板（admin）或携带服务密钥。
 * 允许 service_role 直呼是为了引导阶段创建第一个老板账号。
 *
 * 服务侧鉴权说明（重要）：项目已启用新式 API 密钥体系后，运行时的
 * SUPABASE_SERVICE_ROLE_KEY 与数据库触发器/ pg_cron 持有的旧式 JWT 可能不再是
 * 同一个值——此时仅靠 SUPABASE_SERVICE_ROLE_KEY 比较会让 DB Webhook / 定时任务
 * 全部 401（本项目就踩过：确认通知与提醒链路整体静默失败）。
 * 因此额外接受一个由我们自己在 secrets 里设置的 WEBHOOK_SERVICE_TOKEN，
 * 数据库侧（见 0008/0009/0007 迁移与 DEPLOYMENT.md）发送的就是它的值。
 */
export async function requireAdminOrService(
  supabase: SupabaseClient,
  req: Request
): Promise<AdminCheck> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const webhookToken = Deno.env.get("WEBHOOK_SERVICE_TOKEN") ?? "";
  const token = (req.headers.get("Authorization") ?? "").replace(
    /^Bearer\s+/i,
    ""
  );

  if (token && (token === serviceKey || token === webhookToken)) {
    return { ok: true, callerId: null };
  }

  if (!token) {
    return { ok: false, response: json({ error: "缺少登录凭证" }, 401) };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, response: json({ error: "登录凭证无效" }, 401) };
  }

  const { data: roleRow, error: roleErr } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (roleErr) {
    return { ok: false, response: json({ error: roleErr.message }, 500) };
  }
  if (!roleRow) {
    return {
      ok: false,
      response: json({ error: "权限不足：仅老板可执行此操作" }, 403),
    };
  }

  return { ok: true, callerId: data.user.id };
}
