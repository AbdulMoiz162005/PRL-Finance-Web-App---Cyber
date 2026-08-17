# Project Status

## What has been done

**Refinery Terminal Finance & ERP** — a complete, multi-role finance platform for an oil refinery terminal.

- **Database** (`database/`): Supabase PostgreSQL schema (`001_schema.sql` — 21 tables, enums, indexes, triggers) and RLS lock-down migration (`002_rls.sql`).
- **Backend** (`backend/`): Express + TypeScript REST API with dual DB adapters (Supabase for production, embedded SQLite for local preview). 18 API route groups (auth, users, departments, settings, chart of accounts, journal entries, invoices AP/AR, payments, vendors, customers, bank accounts, budgets, petty cash, fixed assets, reports, dashboard, audit logs, notifications). Role-based access control across 7 roles, audit logging, auto-numbering, idempotent seed data.
- **Frontend** (`frontend/`): React + Vite + TypeScript SPA with 21 pages: login, dashboard (KPIs + charts), chart of accounts + GL drill-down, journal entry workflow (create/approve/post/reverse), trial balance, reports hub (P&L, balance sheet, cash flow, aging, budget-vs-actual, department spend, CSV export), invoices, payments, vendors, customers, bank accounts, budgets, petty cash, fixed assets, users & roles, departments, audit logs, notifications, settings.
- **Verification**: multi-role workflows tested end-to-end (journaling, invoicing, payments, reconciliation); trial balance stays balanced; RBAC enforced; frontend typechecks and production build clean.
- **Deployment**: `render.yaml` (backend), `netlify.toml` (frontend), `docs/DEPLOYMENT.md`, `.env.example` files.

## Git / remote

- Work committed on local `master` and **pushed to GitHub**.
- Remote: https://github.com/AbdulMoiz162005/PRL-Finance-Web-App---Cyber.git
- Branch `main` on the remote now contains the full project history.

## Local development

```bash
# backend
cd backend && npm install && npm run dev   # API on http://localhost:3001

# frontend
cd frontend && npm install && npm run dev  # SPA on http://localhost:5173 (proxies /api to :3001)
```

Default sign-in (seeded): `admin@refinery.local` / `Refinery@2024`

## Production deployment

Follow `docs/DEPLOYMENT.md` to deploy the backend to Render and the frontend to
Netlify with Supabase as the database.
