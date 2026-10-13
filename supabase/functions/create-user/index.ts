// Edge Function: create-user
// 老板创建员工/会员/老板账号。service_role 仅存在于服务端环境变量。
// 调用方式：supabase.functions.invoke("create-user", { body: {...} })
// 引导调用（创建第一个老板账号）：用 service_role 密钥直接 POST。

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
    const { role, name, email, phone, password, title, bio, initial_balance } =
      body ?? {};

    if (!role || !["admin", "staff", "customer"].includes(role)) {
      return json({ error: "无效的角色" }, 400);
    }
    if (!name || typeof name !== "string") {
      return json({ error: "请填写姓名" }, 400);
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return json({ error: "请填写有效的邮箱" }, 400);
    }

    const finalPassword =
      typeof password === "string" && password.length >= 8
        ? password
        : generatePassword();

    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email,
        password: finalPassword,
        email_confirm: true,
        user_metadata: { name, phone: phone ?? null },
        app_metadata: { role },
      });
    if (createError) return json({ error: createError.message }, 400);
    if (!created.user) return json({ error: "创建账号失败" }, 500);

    const userId = created.user.id;
    const { data: store } = await supabase
      .from("stores")
      .select("id")
      .order("created_at")
      .limit(1)
      .maybeSingle();

    // 同步业务档案；失败则回滚认证账号，避免产生半成品账号
    let bizError: string | null = null;
    if (role === "staff") {
      const { data: staffRow, error } = await supabase
        .from("staff")
        .insert({
          user_id: userId,
          name,
          title: title ?? null,
          bio: bio ?? null,
          store_id: store?.id ?? null,
        })
        .select("id")
        .single();
      if (error) {
        bizError = error.message;
      } else {
        // 新技师默认可接全部在售项目，老板可在「服务项目」中按需取消勾选
        const { data: activeServices } = await supabase
          .from("services")
          .select("id")
          .eq("is_active", true);
        if (activeServices && activeServices.length > 0) {
          await supabase.from("staff_services").insert(
            activeServices.map((s) => ({
              staff_id: (staffRow as { id: string }).id,
              service_id: (s as { id: string }).id,
            }))
          );
        }
      }
    } else if (role === "customer") {
      const balance =
        typeof initial_balance === "number" && initial_balance >= 0
          ? initial_balance
          : 0;
      const { error } = await supabase.from("members").insert({
        user_id: userId,
        name,
        phone: phone ?? null,
        email,
        balance,
        store_id: store?.id ?? null,
      });
      if (error) bizError = error.message;
    }

    if (bizError) {
      // 回滚认证账号，避免留下「能登录但没有业务档案」的半成品。
      //
      // 但回滚本身也可能失败（网络抖动 / Admin API 5xx）。此时若直接返回错误，
      // 调用者以为「没建成」，而实际上库里已经躺着一个能登录、user_roles 里还有
      // 角色的幽灵账号 —— 老板再建一次就会撞上 "该邮箱已注册"，且没人知道为什么。
      // 因此这里必须把回滚结果如实区分开，并在失败时留下可追查的痕迹。
      const { error: rollbackError } = await supabase.auth.admin.deleteUser(userId);

      if (rollbackError) {
        console.error(
          "create-user ROLLBACK FAILED — 可能残留幽灵账号:",
          JSON.stringify({
            user_id: userId,
            email,
            role,
            biz_error: bizError,
            rollback_error: rollbackError.message,
          })
        );
        return json(
          {
            error:
              `创建业务档案失败（${bizError}），且账号回滚未成功。` +
              `该邮箱可能已被占用但无法登录使用，请先在「用户管理」中删除后重试。`,
            user_id: userId,
            rollback_failed: true,
          },
          500
        );
      }

      return json(
        { error: `创建业务档案失败，已回滚账号：${bizError}`, rollback_failed: false },
        500
      );
    }

    // profiles 与 user_roles 由 on_auth_user_created 触发器自动创建
    return json({
      user_id: userId,
      email,
      password: finalPassword,
      message: "请立即记录，密码仅此一次展示",
    });
  } catch (e) {
    console.error("create-user fatal:", e);
    return json({ error: "创建账号失败，请稍后重试" }, 500);
  }
});
