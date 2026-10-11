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
 * 校验调用者是老板（admin）或携带 service_role 密钥。
 * 允许 service_role 直呼是为了引导阶段创建第一个老板账号。
 */
export async function requireAdminOrService(
  supabase: SupabaseClient,
  req: Request
): Promise<AdminCheck> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = (req.headers.get("Authorization") ?? "").replace(
    /^Bearer\s+/i,
    ""
  );

  if (token === serviceKey) {
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
