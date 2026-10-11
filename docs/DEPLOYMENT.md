# 部署与配置说明（linzi-care · 已联通 Supabase & PWA 推送上线）

> 本项目已成功与你的 Supabase 远程项目 **`linzi-care`（Ref: `bzjsbiafxxgljbdcreqf`）** 深度关联，数据库迁移全量推送完成，**PWA Web Push 系统推送、Database Webhook 实时通知与 pg_cron 5分钟定时队列**已全量上线。

---

## 一、已就绪的云端资源清单

| 资源项 | 状态 / 详情 |
|---|---|
| **项目 ID (Ref)** | `bzjsbiafxxgljbdcreqf` |
| **API 地址** | `https://bzjsbiafxxgljbdcreqf.supabase.co` |
| **数据库** | PostgreSQL 17 (已应用 0001～0008 迁移：表结构 + RLS + 触发器 + 真实种子数据 + push_subscriptions + reminders + Webhook) |
| **服务项目** | **20 个真实项目** (姜汤头疗、瑶浴泡浴、面部紧致、精油开背等，全带会员价/门市价) |
| **商品橱窗** | **8 款精选颐养好物** (草本茶饮、精油香氛、护肤用品、养生好物) |
| **Edge Functions** | 4 个已部署在线：`create-user`、`manage-user`、`send-reminder`、**`send-push` (带 VAPID 签名、失效端点清理与邮件兜底)** |
| **PWA 与推送** | `manifest.webmanifest` (standalone)、`public/sw.js` (push/click)、192/512/maskable 图标全就绪 |
| **实时与调度** | Database Webhook (appointments 变动实时推送给老板和技师)；`pg_cron` 每 5 分钟扫描 reminders 队列 |

---

## 二、初始系统账号与凭证

系统为完全封闭制，初始化已预置了老板、技师和会员测试账号：

| 角色 | 姓名 | 登录邮箱 | 密码 | 权限范围 |
|---|---|---|---|---|
| **admin (老板)** | 林梓老板 | `admin@linzi.com` | `LinziAdmin2026!#` | 管理端全权限、人员建号、日历调度、余额权威调整，接收新预约实时系统弹窗 |
| **staff (技师)** | 林小梓 | `staff.lin@linzi.com` | `StaffLin2026!#` | 员工端只读：查看自己的 14 天排班与被分配的预约，接收分配预约实时推送 |
| **customer (会员)** | 张女士 | `vip.zhang@linzi.com` | `VipZhang2026!#` | 顾客端：在线预约、开启手机到店通知、查看预约历史、余额查询（测试余额 ¥520） |

---

## 三、PWA 移动端运行与推送机制

### 1. Android Chrome 设备
- 打开网站，点击「开启预约提醒」按钮。
- 浏览器直接弹出原生系统通知权限请求，点击“允许”。
- 手机锁屏或后台挂起时，预约前 2 小时自动收到系统横幅/弹窗，点击直接唤醒并打开网站 `/my` 页面。

### 2. iOS 16.4+ 苹果设备 (遵循 Apple 规范)
- Safari 浏览器受 Apple 强限制，直接在网页内不能请求系统推送权限。
- 顾客端内置智能引导弹窗：提示用户点击 Safari 底部的「**分享**」按钮 → 选择「**添加到主屏幕**」。
- 从手机桌面打开「**梓养云**」独立图标后，点击「开启预约提醒」，iOS 会弹出原生系统通知授权弹窗。
- 授权后，系统弹窗即与原生 App 体验完全一致。

### 3. 后端自动化链路
- **预约创建/状态变更**：触发 Database Webhook，异步调用 `send-push` 实时向老板和技师推送通知。
- **预约到期提醒**：触发器自动计算提前 2 小时的时间点写入 `reminders` 表；`pg_cron` 每 5 分钟轮询，调用 `send-push` 向顾客推送。
- **失效订阅自愈**：当用户卸载应用或重置浏览器导致推送返回 404/410 时，后端自动从数据库清理该失效端点。
- **邮件兜底**：若顾客未开启 PWA 推送或推送发送失败，系统自动降级调用 Resend 发送邮件提醒。

---

## 四、生产部署到 Vercel

1. 将本地项目提交至 GitHub：
   ```bash
   git add .
   git commit -m "feat: implement pwa web push notification with supabase backend"
   git push origin main
   ```
2. 在 Vercel 导入项目，配置 3 个环境变量：
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://bzjsbiafxxgljbdcreqf.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6anNiaWFmeHhnbGpiZGNyZXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MTAyNTYsImV4cCI6MjEwNzI4NjI1Nn0.qEUQLQnfxUTjuYKtq8vxkJSmF_5y_6v10m6BF_hfTD0`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = `BFHMem0rZxvO7jgan4LOXIeKaR4UWAGStRDUKhXrD6xkniecuB3rVc7wNnFtBJcJ_fCK_PQ4nnk4R9s7rbMRw0w`
3. 部署上线。

---

## 五、邮件提醒配置 (可选)

如需启用 Resend 真实发信兜底：
```bash
npx supabase secrets set RESEND_API_KEY=re_你的ResendKey --project-ref bzjsbiafxxgljbdcreqf
npx supabase secrets set RESEND_FROM="林梓精养馆 <noreply@你的域名.com>" --project-ref bzjsbiafxxgljbdcreqf
```
