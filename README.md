# Linzi Care · 林梓精养馆

[![CI](https://github.com/alvinluo-tech/linzi-care/actions/workflows/ci.yml/badge.svg)](https://github.com/alvinluo-tech/linzi-care/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)
[![Next.js 16.4](https://img.shields.io/badge/Next.js-16.4-black)](https://nextjs.org)
[![React 19.3](https://img.shields.io/badge/React-19.3-blue)](https://react.dev)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%2017-3ECF8E)](https://supabase.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

A refined appointment and member management platform for boutique wellness studios. Built as a single-store MVP with a **closed account model** (no public signup), a **display-only storefront**, and a **server-authoritative member balance** — styled in a modern Chinese-inspired light-luxury aesthetic.

> 林梓精养馆 —— 面向精品养生馆的预约与会员管理系统：分配制账号 · 纯展示商城 · 服务端权威余额。

## Highlights

- **Conflict-free booking engine** — a transactional Postgres RPC validates staff schedules and overlapping appointments, guarded by a per-technician advisory lock and a partial unique index. Cancelled / no-show slots free up automatically.
- **Server-authoritative balances** — the `balance` column privilege is revoked from all authenticated roles; updates flow exclusively through an audited RPC (`admin_update_balance`) protected by a database trigger, with every change recorded in `balance_logs`.
- **Row-level security end to end** — `user_roles` is the single source of truth; customers see only their own bookings, staff only their own schedule and assigned appointments, and the owner has full control. Frontend bugs cannot leak data.
- **Assigned accounts, credentials shown once** — the owner creates staff/customer accounts from the admin console; an Edge Function calls the Admin API with `service_role`, generates a random password, and displays it exactly once.
- **Realtime admin console** — appointment inserts stream over Supabase Realtime with toast + chime notification, no refresh needed.
- **PWA with layered reminders** — installable manifest, Service Worker, and Web Push (VAPID) notifications before each appointment, with automatic email fallback via Resend for unsubscribed users.
- **Scheduled jobs on the free tier** — `pg_cron` + `pg_net` drive reminder scans every 15 minutes, plus a daily heartbeat against free-tier auto-pause.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | [Next.js 16.4](https://nextjs.org) (App Router, Cache Components / PPR, Turbopack) |
| UI | [React 19.3](https://react.dev), [Tailwind CSS 4](https://tailwindcss.com), [shadcn/ui](https://ui.shadcn.com) |
| Language | TypeScript 5 (strict) |
| Backend | [Supabase](https://supabase.com) — Postgres 17, PostgREST, Row-Level Security, Realtime, Edge Functions (Deno) |
| Scheduling | `pg_cron` + `pg_net` |
| Notifications | Web Push (VAPID), [Resend](https://resend.com) email fallback |
| Deployment | Vercel (web) + Supabase (backend), free tier friendly |

## Getting Started

### Prerequisites

- Node.js ≥ 20.9 (22 LTS recommended) and npm ≥ 10
- A [Supabase](https://supabase.com) project (free tier works)
- (Optional) a Resend API key for email reminders

### 1. Clone and install

```bash
git clone https://github.com/alvinluo-tech/linzi-care.git
cd linzi-care
npm install
```

### 2. Configure environment

Copy the example and fill in your Supabase project values (Dashboard → Project Settings → API):

```bash
cp .env.example .env.local
```

| Variable | Scope | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key (safe for the browser; RLS applies) |
| `RESEND_API_KEY` / `RESEND_FROM` | Edge Function secret | Email reminder delivery |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | public / Edge Function secret | Web Push keys (`npx web-push generate-vapid-keys`) |

Never expose `service_role` keys or Edge Function secrets to the client. Full setup — migrations, Edge Function deployment, cron schedules, and bootstrapping the first owner account — is documented in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

### 3. Run

```bash
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint
```

If your network reaches Supabase/GitHub only through a proxy, start the dev server with Node's env-proxy support:

```bash
NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 npm run dev
```

Demo accounts for local development are listed in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

### 4. End-to-end tests

A 32-case E2E suite lives in `tests/e2e/` and exercises the **real** backend (live Supabase project) plus the rendered pages — no mocks. It follows Given-When-Then, runs strictly sequentially, and cleans up every record it creates (test bookings are tagged and deleted; balances are restored).

```bash
npm run dev        # terminal 1 — suite verifies pages on http://localhost:3002
npm run test:e2e   # terminal 2 — run all 32 cases
```

Coverage: anonymous RLS boundaries · public pages & PWA assets · three-role auth · customer booking journey (slots, conflict rejection, self-cancel) · owner confirmation with customer notification loop · staff check-in (arrived/done/no-show) · appointment state-machine guards · balance security & audit trail.

If Supabase is only reachable through a proxy, the suite defaults to `http://127.0.0.1:7897`; override with `E2E_PROXY=direct` or `E2E_PROXY=http://host:port`.

## Project Structure

```
src/
  app/
    (site)/          Customer-facing: home, services, booking wizard, shop, login, /my
    admin/           Owner console: dashboard, calendar, staff, members,
                     services, products, schedules, reports
    staff/           Technician view: assigned schedule & appointments
  components/        Brand elements, booking wizard, admin console, shadcn/ui primitives
  lib/
    supabase/        Browser & server clients (@supabase/ssr)
    auth-server.ts   Server-side session + role resolution (timeout-hardened)
    types.ts         Database types synced with migrations
  proxy.ts           Session refresh middleware (Next.js 16 proxy convention)
supabase/
  migrations/        0001 schema → 0002 RLS → 0003 RPCs → 0004 seed → …
  functions/         create-user · manage-user · send-reminder · send-push
  scripts/           Manual cron setup helper
docs/
  DEPLOYMENT.md      Full deployment guide (Supabase → Vercel)
  ACCEPTANCE.md      Acceptance test cases mapped to requirements
  DESIGN_PRINCIPLES.md
```

## Security Model

| Concern | Enforcement |
| --- | --- |
| Role-based access | `user_roles` table + RLS policies on every table; `has_role()` helper is `SECURITY DEFINER` to avoid recursion |
| Member balance | `REVOKE UPDATE (balance)`, a guard trigger that rejects direct updates, and a single audited RPC entry point |
| Booking conflicts | `create_appointment()` RPC: schedule coverage + overlap checks + `pg_advisory_xact_lock` + partial unique index |
| Account lifecycle | Edge Functions with admin-JWT verification; passwords generated server-side and shown once |

## Deployment

Deploy the web app to Vercel and the backend to Supabase — both work on free tiers. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the complete, ordered guide, and [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) for the acceptance checklist.

## Contributing

Contributions are welcome!

- Follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, `chore:`, …) — commit messages **in English**.
- Keep changes focused; run `npm run lint` and `npm run build` before opening a PR.
- UI copy visible to customers is written in Simplified Chinese; code, comments, and commit messages are in English.

## License

Released under the [MIT License](LICENSE).
