# ProdBoard

Live visibility of pending deliverables across your teams: a shared board (Kanban / List / Card grid), per-product boards, a weekly report, task history, time-travel, and CSV export. Built with Next.js (App Router) + Prisma + Postgres, with email/password auth and organization scoping baked in from day one.

## What it does

- **Main Board** with three views: Kanban (drag a task between status columns), List, and Card grid. List and Card grid sort by Priority, Due date, Status, Owner, Product or Last update.
- **Products**: each product is a name + one platform type (e.g. "Winbundle Mobile App"). Products are created once, name and PM are editable afterwards, type is fixed, and products are **decommissioned** (hidden) rather than deleted. Each product has its own detail panel and its own Product Board (same three views).
- **Tasks** carry a product, owner, team/function, 3-level priority, status, start/due dates, an optional service request, and a blocker. Every change is written to **task history** and a shared **activity feed**.
- **Weekly report** over a date range, grouped by service request then product, ready to export.
- **Time-travel**: view the board as of a past date's close of business; exports from that view are watermarked.
- **Roles**: Admin (Lead PM), PM, Viewer (read-only, e.g. the CTO). The first person to register an organization becomes its Admin.

## Tech

- Next.js 14 (App Router, route handlers) · React 18 · TypeScript
- Prisma 5 + PostgreSQL
- Auth: bcrypt password hashing + signed JWT session cookie (`jose`), enforced in `middleware.ts`
- Every row is scoped by `organizationId`; the schema is multi-tenant so the app can grow into a multi-org product.

## Local development

```bash
npm install                 # installs deps and runs `prisma generate`
cp .env.example .env        # then fill in the values (see below)
npm run db:push             # create the schema in your database
npm run db:seed             # optional: first admin + example data
npm run dev                 # http://localhost:3000
```

### Environment variables

See `.env.example`. You need:

- `DATABASE_URL` — pooled Postgres connection string (used at runtime)
- `DIRECT_URL` — direct (non-pooled) connection string (used for migrations)
- `AUTH_SECRET` — a long random string: `openssl rand -base64 32`
- `SEED_*` — the first admin account and whether to insert example data (used only by `npm run db:seed`)

## Deploy to Vercel + Neon (recommended)

1. **Database (Neon):** create a project at neon.tech. Copy the **pooled** connection string into `DATABASE_URL` (keep `?sslmode=require`, add `&pgbouncer=true&connection_limit=1`) and the **direct** string into `DIRECT_URL`.
2. **Repo:** push this repository to GitHub (already done if you are reading this there).
3. **Vercel:** "New Project" → import this repo. Add the env vars from step 1 plus `AUTH_SECRET`. Deploy. The build command (`prisma generate && next build`) runs automatically.
4. **Schema:** from your machine, point `.env` at the Neon database and run `npm run db:push` once (or use `npm run db:migrate` with committed migrations).
5. **First admin:** set the `SEED_*` vars locally against the Neon DB and run `npm run db:seed`, **or** just open the deployed site and sign up — the first person to register an organization becomes its Admin.

> Do not commit a real `.env`. `AUTH_SECRET` and database credentials belong in Vercel's environment settings, never in the repo.

## Project layout

```
app/
  api/            REST route handlers (auth, bootstrap, products, tasks, activity, teams, users)
  components/     Dashboard.tsx (the app UI) + helpers.ts
  dashboard/      authenticated page
  login/ signup/  auth pages
lib/              db (Prisma client), auth (hashing + sessions), api (guards), constants
prisma/           schema.prisma + seed.ts
middleware.ts     route protection
```

## Roadmap (not yet built)

- Real email notifications and reminders (needs a mail service)
- SSO / company identity login
- Server-enforced per-product permissions beyond role level
- Approval gate on "Complete"
- Billing and seat / product / task limits for multi-org (PaaS) mode

## Notes

- Activity and history are written server-side, so they stay consistent no matter which client made the change.
- The dashboard loads everything in one `/api/bootstrap` call and refetches after mutations; there is no websocket layer yet, so another user's change shows on the next action or refresh.
