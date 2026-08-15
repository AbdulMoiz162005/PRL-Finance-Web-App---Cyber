# Refinery Terminal Finance & ERP System

A complete, multi-role finance management platform built for an Oil Refinery Terminal.
Covers the full accounting cycle, payables/receivables, banking, budgeting, petty cash,
fixed assets, financial reporting and executive dashboards.

## Stack

| Layer     | Technology                                   | Deploy target |
|-----------|----------------------------------------------|---------------|
| Database  | Supabase (PostgreSQL) with full schema + RLS | supabase.com  |
| Backend   | Node.js + Express + TypeScript (REST API)    | render.com    |
| Frontend  | React + Vite + TypeScript + Recharts         | netlify.com   |

## Repository layout

```
database/   Supabase SQL migrations (schema, seed, RLS) + apply instructions
backend/    Express REST API (deploy to Render)
frontend/   React SPA (deploy to Netlify)
```

## Quick start (local preview)

```bash
# 1. Backend (SQLite fallback when no Supabase env vars are set — identical schema)
cd backend
npm install
npm run dev          # API on http://localhost:3001

# 2. Frontend
cd frontend
npm install
npm run dev          # SPA on http://localhost:5173 (proxies /api to :3001)
```

Default sign-in (from seed): `admin@refinery.local` / `Refinery@2024`

## Production deployment

See `docs/DEPLOYMENT.md` for step-by-step Supabase, Render and Netlify setup.
Set these environment variables on Render (backend):

```
SUPABASE_URL=<your-project-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
JWT_SECRET=<strong-random-secret>
CORS_ORIGINS=https://<your-netlify-app>.netlify.app
PORT=10000
```

## Feature matrix

- Multi-role access control (Super Admin, Director, Finance Manager, Accountant,
  Cashier, Auditor, Viewer) with per-role permissions
- Chart of Accounts with hierarchical grouping (Assets, Liabilities, Equity, Revenue, Expense)
- Double-entry journal entries: draft / posted / reversed lifecycle, auto-balance validation,
  approval workflow and full audit trail
- General Ledger, Trial Balance, P&L, Balance Sheet and Cash Flow reports
- Accounts Payable / Accounts Receivable with invoicing, tax, due dates, aging and
  approval-to-posting workflow
- Payments & receipts with multiple methods (cash, bank transfer, cheque, card)
- Multi-currency support with base currency and exchange rates
- Bank account register with reconciliation
- Annual operating budgets with budget-vs-actual variance reporting
- Petty cash funds and expense tracking
- Fixed asset register with straight-line depreciation posting
- Executive dashboard with KPIs and trend charts
- Audit logs, notifications, company settings
