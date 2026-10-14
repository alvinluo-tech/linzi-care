/**
 * 验证测试护栏真的会拦截，而不只是"写了但从不触发"。
 *
 * 一个从不报警的护栏比没有护栏更危险：它会让人误以为已经安全。
 * 这里逐条验证四种情形：
 *   1. 正常测试账号 → 通过
 *   2. email 与 E2E_MEMBER_EMAIL 不符 → 拦截
 *   3. email 域名不在白名单 → 拦截
 *   4. 会员不存在 → 拦截
 */
import { assertIsTestMember, TestGuardError } from "../tests/test-guard";
import { loadEnv } from "../tests/load-env";

loadEnv();

const realEmail = process.env.E2E_MEMBER_EMAIL!;
console.log(`测试账号配置: ${realEmail}\n`);

let pass = 0;
let fail = 0;

function check(label: string, fn: () => void, expectThrow: boolean) {
  try {
    fn();
    if (expectThrow) {
      console.log(`✗ ${label}  —— 期望拦截，但放行了！`);
      fail++;
    } else {
      console.log(`✓ ${label}  —— 放行（正确）`);
      pass++;
    }
  } catch (e) {
    const isGuard = e instanceof TestGuardError;
    if (expectThrow && isGuard) {
      console.log(`✓ ${label}  —— 已拦截`);
      console.log(`    ${String((e as Error).message).split("\n")[0]}`);
      pass++;
    } else if (expectThrow) {
      console.log(`✗ ${label}  —— 抛错了但类型不对: ${e}`);
      fail++;
    } else {
      console.log(`✗ ${label}  —— 不该拦却拦了: ${(e as Error).message}`);
      fail++;
    }
  }
}

// 1) 正常测试账号：应放行
check(
  "测试账号（与配置一致、域名在白名单）",
  () =>
    assertIsTestMember(
      { id: "x", name: "张女士", email: realEmail, balance: 1000 },
      "单元测试"
    ),
  false
);

// 2) 真实顾客邮箱：应拦截（这是最要命的场景 —— E2E_MEMBER_EMAIL 配错了）
check(
  "非白名单域名的邮箱（与配置不符）",
  () =>
    assertIsTestMember(
      {
        id: "y",
        name: "某顾客",
        // 刻意用示例域名而不是真实顾客的邮箱：这是公开仓库，
        // 真实顾客的 PII 不该出现在测试夹具里（哪怕只是常量）。
        email: "customer@example.com",
        balance: 200,
      },
      "单元测试"
    ),
  true
);

// 3) 域名不在白名单：应拦截（即便名字/结构看起来像测试号）
check(
  "邮箱域名不在白名单",
  () =>
    assertIsTestMember(
      { id: "z", name: "某顾客", email: "someone@example.com", balance: 0 },
      "单元测试"
    ),
  true
);

// 4) 会员不存在：应拦截
check(
  "会员不存在（null）",
  () => assertIsTestMember(null, "单元测试"),
  true
);

// 5) 同名但非测试账号：这正是原实现会误删的那类数据
check(
  "同名「张女士」但邮箱不同（旧实现会误删）",
  () =>
    assertIsTestMember(
      { id: "w", name: "张女士", email: "zhang@gmail.com", balance: 500 },
      "单元测试"
    ),
  true
);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
