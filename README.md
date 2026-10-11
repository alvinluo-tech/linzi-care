# 梓养云 · 轻约版（linzi-care）

林梓精养馆（广州增城新塘国贸汇店）预约与人员管理系统 · 单店 MVP。
新中式轻奢养生风，面向「分配制账号 + 纯展示商城 + 服务端权威余额」的封闭运营场景。

---

## ⚡ 现成云端环境（已全量连通并就绪）

项目已成功连接到你的 Supabase 项目 `linzi-care`（`bzjsbiafxxgljbdcreqf`），数据库结构、20 个真实项目种子数据、3 个 Edge Functions 与定时任务已全部部署并验证通过。

### 系统初始账号凭证（可直接用于本地与生产测试）

| 角色 | 姓名 | 登录账号 | 登录密码 | 权限与访问入口 |
|---|---|---|---|---|
| **老板 (admin)** | 林梓老板 | `admin@linzi.com` | `LinziAdmin2026!#` | 管理端全权限：[`/admin`](http://localhost:3002/admin)（仪表盘、预约日历、员工、会员、余额调整、排班、报表） |
| **员工 (staff)** | 林小梓 | `staff.lin@linzi.com` | `StaffLin2026!#` | 员工端只读：[`/staff`](http://localhost:3002/staff)（查看未来 14 天排班与被分配的预约） |
| **会员 (customer)** | 张女士 | `vip.zhang@linzi.com` | `VipZhang2026!#` | 顾客端：[`/my`](http://localhost:3002/my)（在线预约、查看预约历史、余额查询；初始测试余额 ¥520） |

---

## 技术栈

| 层级 | 技术 | 版本 / 说明 |
|---|---|---|
| 前端框架 | Next.js | **16.4.0**（React 19.3，Cache Components / PPR 启用） |
| 语言与样式 | TypeScript 5 + Tailwind CSS 4 | 新中式轻奢色板（深棕 `#3D2B1F` / 暖米白 `#F5F0E8` / 金铜 `#B8860B`） |
| UI 组件库 | shadcn/ui | 24 个基础组件（含周视图日历、状态流转抽屉、凭证单次弹窗等） |
| 后端/数据库 | Supabase | PostgreSQL 17，PostgREST v14，Realtime，Edge Functions（Deno 运行时） |
| 调度系统 | pg_cron + pg_net | 每小时整点触发邮件提醒 Edge Function，每日早9点心跳防免费休眠 |

---

## 核心设计与安全规范

1. **完全封闭式分配制账号**：不开放公开注册入口。所有账号均由老板在管理端创建；Edge Function 调 Admin API 生成随机密码并在前端**仅弹窗展示一次**，不落文明细。
2. **纯服务端权威余额**：数据库层施加触发器强制校验 `guard_member_balance_update`，任何人（包括前端直连或越权注入）无法直接执行 UPDATE balance；唯一允许的更新入口是通过安全定义函数 `admin_update_balance` RPC，全量记录新旧余额与操作员审计日志。
3. **防冲突预约引擎**：通过 `create_appointment` 事务函数执行严格检验（技师有效性、排班区间覆盖、无重叠预约时间）+ Advisory Lock 排他锁，高并发下杜绝撞单。
4. **数据库级 RLS 行级权限兜底**：顾客仅可读写属于自己的预约及本人资料；员工仅可读取本人的排班和关联预约；老板全权管理。

---

## 本地极速启动

```bash
# 1. 安装依赖 (如果尚未安装)
npm install

# 2. 启动开发服务器 (自动加载 .env.local 中已配置好的 Supabase 凭据)
npm run dev

# 访问地址：http://localhost:3002 (或 http://localhost:3000)
```

### 常用验证页面：
- **品牌首页**：[http://localhost:3002/](http://localhost:3002/)（瑶浴文化、三大主业、四大基石、国贸汇门店地址）
- **服务项目**：[http://localhost:3002/services](http://localhost:3002/services)（20项服务真实价格与会员价双轨展示）
- **预约体验**：[http://localhost:3002/book](http://localhost:3002/book)（四步预约流，已配置技师林小梓未来14天排班）
- **颐养商城**：[http://localhost:3002/shop](http://localhost:3002/shop)（纯展示橱窗）
- **管理后台**：[http://localhost:3002/admin](http://localhost:3002/admin)（使用老板账号登录）

---

## 交付文档导航

- 部署说明与生产指引：[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- 详细验收用例与测试指南：[docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)
