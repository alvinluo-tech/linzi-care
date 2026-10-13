# 测试指南

本项目有两套互补的真实环境测试。两者都**直连真实 Supabase**、不做 mock，
因此也都有真实的副作用（改余额、发通知、写预约）。请先读完「隔离」一节再跑。

## 两套测试

| 套件 | 位置 | 层次 | 覆盖 |
| --- | --- | --- | --- |
| API / 数据层 | `tests/e2e/` | PostgREST + RPC | 匿名 RLS 边界、三角色鉴权、预约冲突、余额安全与审计、管理端身份隔离 |
| 浏览器点击层 | `tests/browser/` | Playwright + Chromium | 真实 UI 点击：登录、预约向导、老板接单、技师打点、移动端布局 |

**两套绝不能并发跑。** 它们的 `99-cleanup` / `cleanupBrowserTestData` 会按
标记删除预约记录；并发运行时一方会把另一方的 fixture 删掉，表现为一堆
莫名其妙的"回归"。串行执行是本项目的硬约定。

## 凭据（重要）

源码里**不再有任何硬编码的密钥或口令**。全部来自 `.env.local`（已被
`.gitignore` 的 `.env*` 规则挡住）：

```bash
# 生成 .env.local（幂等，已存在的变量不会被覆盖）
npx tsx scripts/seed-test-env.mts
```

| 变量 | 用途 | 敏感度 |
| --- | --- | --- |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | 被测后端 | anon 受 RLS 约束 |
| `SUPABASE_SERVICE_ROLE_KEY` | 仅测试数据清扫 | **绕过全部 RLS，等同万能钥匙** |
| `E2E_ADMIN_*` / `E2E_STAFF_*` / `E2E_MEMBER_*` | 三个测试账号 | 口令 |
| `E2E_SITE` | 被测站点地址，默认 `http://localhost:3002` | — |

缺任一必需变量时，测试会带清晰报错**直接退出**，不会静默用错凭据。

> 历史遗留：`service_role` 与三个口令曾硬编码在 `tests/` 源码中。
> 已用 `git log -S` 确认该 `service_role` **从未进入 git 历史**，
> 因此只是从「源码常量」搬到了本机环境文件，未扩大暴露面。
> 但 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 与 VAPID 公钥曾提交进
> `docs/DEPLOYMENT.md`，已在该文件中移除。anon key 受 RLS 约束、危害有限，
> 仍建议轮换一次以彻底作废历史暴露。

## 跑起来

```bash
# 1) 启动被测站点（浏览器套件要求生产构建，不是 dev）
npm run build

# 若本机直连 Supabase 被阻断（国内网络常见），服务端也必须走代理，
# 否则管理端接口会成片返回 503 —— 见下方「503 排查」。
set OUTBOUND_PROXY=http://127.0.0.1:7897     # Windows cmd
npx next start -p 3002

# 2a) API / 数据层
npm run test:e2e

# 2b) 浏览器点击层（串行，单 worker）
npx playwright test

# 仅跑时区/格式化的纯函数不变量（进了 CI，无需后端）
npx tsx scripts/verify-format-tz.mts
```

网络：本机直连 Supabase 常被阻断，两套测试默认走本地代理
`http://127.0.0.1:7897`。用 `E2E_PROXY=direct` 强制直连，或用
`E2E_PROXY=http://host:port` 指定其他代理。

### 503 排查（重要，曾误判为代码缺陷）

如果管理端接口成片返回 `503 暂时无法校验登录状态`，而匿名请求正常返回 401，
**先检查代理，不要先改代码**。这是 `requireAdmin()` 的正确行为：服务端进程
拨不通 Supabase 时，它如实上报 503，而不是谎报 401 把已登录的掌柜登出。

判据：

```bash
# 看启动日志有没有这一行 —— 有才说明代理真的生效了
#   [instrumentation] 出站代理已启用: http://127.0.0.1:7897
```

启动 `next start` 时必须显式带上 `OUTBOUND_PROXY`（见上方命令）。注意这与
测试侧客户端用的 `E2E_PROXY` 是**两个独立开关**：前者作用于服务端出站，
后者作用于测试进程自己的请求；两者都要指向可用代理。

验证服务端可达性：

```bash
npx tsx scripts/probe-admin-503.mts
```

这个探针会用真实老板会话请求 `/api/admin/appointments`，并打印原始响应体。
返回 200 即服务端链路正常。

## 隔离：给测试单独开一个 Supabase 分支库

**这是目前最值得排期的一项改进。** 现状是测试跑在真实用户正在交易的
线上库上，已经因此出过一次事故：真实操作把测试会员余额扣到 ¥28，
低于单笔预约价 ¥38，触发 `会籍余额不足`，进而连锁失败 14 项
（表现为一堆误导性的 `Could not find the function` 报错）。

### 落地步骤

```bash
# 1) 建分支库（Supabase 付费功能；免费方案可用第二个独立项目替代）
npx supabase branches create ci --project-ref <your-ref>

# 2) 取分支库的连接信息，写入 .env.local（不要提交）
#    SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
#    全部指向分支库

# 3) 在分支库上重放迁移与种子
npx supabase db push --db-url <branch-connection-string>

# 4) 建三个测试账号（admin / staff / customer），口令写进 .env.local
```

### 进 CI

分支库就绪后，把 `.github/workflows/ci.yml` 里那段「刻意不跑 tests/」的说明
替换成实际步骤，并把凭据配到 GitHub Secrets：

```yaml
      - name: E2E (API layer)
        env:
          SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_ROLE_KEY }}
          E2E_ADMIN_EMAIL: ${{ secrets.TEST_E2E_ADMIN_EMAIL }}
          # …其余账号变量
          E2E_PROXY: direct
        run: npm run test:e2e
```

**在分支库落地之前，绝对不要把这些密钥配到 CI** —— 那等于给每个
PR（包括来自 fork 的）一把线上库的万能钥匙。

## 基线复位

测试会真实扣减会员余额。若怀疑数据被拖歪：

```bash
# 把 E2E 测试会员余额复位到目标值（走老板 RPC，会写 balance_logs 留痕）
npx tsx scripts/reset-e2e-baseline.ts
```

## 已进 CI 的不变量

- `scripts/verify-format-tz.mts` —— 时刻渲染锚定门店时区，覆盖跨日/跨月/跨年/UTC 午夜
- `scripts/verify-format-tz-fallback.mts` —— 模拟「老运行时忽略 IANA 时区」，
  证明回落路径与主路径给出相同结果（需 `TZ=America/New_York` 才有判别力）

这两个防的是同一类静默错误：页面不报错，但每个时间都差几个小时。

## 时区改动须知

门店时区有两处配置，**必须同时改**，否则前后端时段会错位：

| 位置 | 变量 | 默认 |
| --- | --- | --- |
| 前端 | `NEXT_PUBLIC_STORE_TIMEZONE` | `Asia/Shanghai` |
| 数据库 | GUC `app.store_timezone` | `Asia/Shanghai`（`public.store_timezone()` 回落值） |

```sql
-- 改数据库侧
alter database postgres set app.store_timezone = 'Asia/Shanghai';
```

验证改动确实生效（同一日历日在两个时区下时段边界应当不同）：

```bash
npx tsx scripts/verify-timezone-migration.mts
```
