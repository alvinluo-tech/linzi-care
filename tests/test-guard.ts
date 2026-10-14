/**
 * 测试安全护栏（唯一入口）
 *
 * 背景：两套测试套件都直连**真实的线上 Supabase 库**，与正在交易的顾客共用
 * 同一份数据。破坏性操作（删预约、改余额）此前靠「按名字找测试账号」兜底 ——
 * `purgeMemberAppointments()` 用的是 `name = '张女士'`。现在库里恰好只有一个
 * 张女士（我们建的测试号），但这个条件一旦被真实顾客满足，
 * 测试就会**静默删光那位顾客的全部预约**，不报错、不告警。
 *
 * 这里的原则：**任何破坏性操作之前，先证明目标是测试账号**。
 * 证明不了就拒绝执行并抛错 —— 让测试跑不起来，好过悄悄动真实数据。
 *
 * 判定标准（必须同时满足）：
 *   1. email 与 E2E_MEMBER_EMAIL 完全一致（大小写归一）—— 这是配置里的
 *      唯一真源，不是硬编码的人名；
 *   2. email 落在测试域名白名单内（默认 linzi.com），作为第二道确认。
 * 第 2 条的意义在于：万一有人把 E2E_MEMBER_EMAIL 错配成真实顾客邮箱，
 * 仍会被拦住。
 */

/** 允许作为测试账号的邮箱域名（可加多个） */
const ALLOWED_TEST_DOMAINS = (process.env.E2E_TEST_DOMAINS ?? "linzi.com")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export interface TestMember {
  id: string;
  name: string;
  email: string;
  balance: number;
}

export class TestGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestGuardError";
  }
}

/**
 * 校验某个会员档案确实是配置指定的测试账号，否则抛错。
 * 返回该会员的 id/name/email/balance，供调用方直接使用。
 */
export function assertIsTestMember(
  member: { id: string; name: string; email: string | null; balance: number | string } | null,
  context: string
): TestMember {
  const expected = (process.env.E2E_MEMBER_EMAIL ?? "").trim().toLowerCase();

  if (!member) {
    throw new TestGuardError(
      `[${context}] 找不到测试会员（E2E_MEMBER_EMAIL=${expected || "未设置"}）。` +
        `拒绝在身份不明的情况下执行破坏性操作。`
    );
  }

  const email = (member.email ?? "").trim().toLowerCase();

  if (!expected || email !== expected) {
    throw new TestGuardError(
      `[${context}] 目标账号不是配置的测试账号，已中止。\n` +
        `  找到的成员: ${member.name} <${email || "无邮箱"}>\n` +
        `  期望的账号: ${expected || "（E2E_MEMBER_EMAIL 未设置）"}\n` +
        `  这多半说明 E2E_MEMBER_EMAIL 配错了，或库里出现了同名成员。`
    );
  }

  const domain = email.split("@")[1] ?? "";
  if (!ALLOWED_TEST_DOMAINS.includes(domain)) {
    throw new TestGuardError(
      `[${context}] 测试账号邮箱域名 "${domain}" 不在白名单 ` +
        `[${ALLOWED_TEST_DOMAINS.join(", ")}] 内，已中止。\n` +
        `  若确实要用其他域名，设置 E2E_TEST_DOMAINS=<域名>。`
    );
  }

  return {
    id: member.id,
    name: member.name,
    email,
    balance: Number(member.balance ?? 0),
  };
}

/**
 * 按 E2E_MEMBER_EMAIL 查找测试会员并完成校验。
 * 「查找」与「校验」绑在一起，避免调用方拿到 id 后忘了验。
 */
export async function resolveTestMember(
  client: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          c: string,
          v: string
        ) => { maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }> };
      };
    };
  },
  context: string
): Promise<TestMember> {
  const email = process.env.E2E_MEMBER_EMAIL ?? "";
  const res = (await client
    .from("members")
    .select("id, name, email, balance")
    .eq("email", email)
    .maybeSingle()) as {
    data: { id: string; name: string; email: string | null; balance: number | string } | null;
    error: { message: string } | null;
  };

  if (res.error) {
    throw new TestGuardError(`[${context}] 查询测试会员失败: ${res.error.message}`);
  }

  return assertIsTestMember(res.data, context);
}
