// Edge Function: manage-user
// 老板管理账号：重置密码 / 停用（封禁）与启用 / 删除账号。
// body: { action: "reset_password" | "set_banned" | "delete_account", user_id, banned? }

import "@supabase/functions-js/edge-runtime.d.ts";
import { json, preflight } from "../_shared/cors.ts";
import { requireAdminOrService, serviceClient } from "../_shared/auth.ts";
import { generatePassword } from "../_shared/password.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const supabase = serviceClient();
    const auth = await requireAdminOrService(supabase, req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const { action, user_id } = body ?? {};
    if (!action || !user_id) {
      return json({ error: "缺少 action 或 user_id" }, 400);
    }

    switch (action) {
      case "reset_password": {
        const newPassword = generatePassword();
        const { error } = await supabase.auth.admin.updateUserById(user_id, {
          password: newPassword,
        });
        if (error) return json({ error: error.message }, 400);
        return json({
          password: newPassword,
          message: "新密码已生效，仅此一次展示",
        });
      }

      case "set_banned": {
        const banned = Boolean(body.banned);
        // 350000h ≈ 40 年，视为永久停用；"none" 解除封禁
        const { error } = await supabase.auth.admin.updateUserById(user_id, {
          ban_duration: banned ? "350000h" : "none",
        });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true, banned });
      }

      case "delete_account": {
        // 硬删除认证账号；profiles / user_roles / members / staff 由外键级联清理
        const { error } = await supabase.auth.admin.deleteUser(user_id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      default:
        return json({ error: "未知的 action" }, 400);
    }
  } catch (e) {
    console.error("manage-user fatal:", e);
    return json({ error: "账号操作失败，请稍后重试" }, 500);
  }
});
