import { CREDENTIALS, expect, login, q, retry, suite } from "../setup";

/**
 * 模块二：认证与角色体系
 */
export const authSpec = suite("认证与角色体系", [
  {
    name: "GIVEN 正确凭证 WHEN 三种角色分别登录 THEN 全部成功",
    run: async () => {
      for (const [role, cred] of Object.entries(CREDENTIALS)) {
        const c = await login(cred.email, cred.password);
        const { data } = await retry(() => c.auth.getUser());
        expect(!!data.user, `${role} 登录后拿不到用户`);
      }
    },
  },
  {
    name: "GIVEN 错误密码 WHEN 登录 THEN 被拒绝",
    run: async () => {
      const c = await login(CREDENTIALS.boss.email, CREDENTIALS.boss.password);
      const { error } = await c.auth.signInWithPassword({
        email: CREDENTIALS.member.email,
        password: "wrong-password-123",
      });
      expect(!!error, "错误密码竟能登录");
      expect(
        error!.message.includes("Invalid login credentials"),
        `拒绝原因异常: ${error!.message}`
      );
    },
  },
  {
    name: "GIVEN 三个角色 WHEN 查询 user_roles THEN 角色与身份一一对应",
    run: async () => {
      const expected: Record<string, string> = {
        [CREDENTIALS.boss.email]: "admin",
        [CREDENTIALS.staff.email]: "staff",
        [CREDENTIALS.member.email]: "customer",
      };
      for (const [email, role] of Object.entries(expected)) {
        const cred = Object.values(CREDENTIALS).find((c) => c.email === email)!;
        const c = await login(cred.email, cred.password);
        const { data } = await retry(() => c.auth.getUser());
        const roles = await retry(() =>
          q(c.from("user_roles").select("role").eq("user_id", data.user!.id))
        );
        expect(
          roles.some((r: any) => r.role === role),
          `${email} 应具有角色 ${role}，实际: ${roles.map((r: any) => r.role).join(",")}`
        );
      }
    },
  },
]);
