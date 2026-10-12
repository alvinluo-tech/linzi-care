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
      await supabase.auth.admin.deleteUser(userId);
      return json(
        { error: `创建业务档案失败，已回滚账号：${bizError}` },
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
