-- ============================================================
-- Refinery Terminal Finance & ERP - Core Schema (PostgreSQL)
-- Run this in the Supabase SQL Editor (migrations/001_schema.sql)
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Enum types ----------
create type user_role as enum ('SUPER_ADMIN','FINANCE_DIRECTOR','FINANCE_MANAGER','ACCOUNTANT','CASHIER','AUDITOR','VIEWER');
create type account_type as enum ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE');
create type journal_status as enum ('DRAFT','POSTED','REVERSED');
create type invoice_kind as enum ('AP','AR');
create type invoice_status as enum ('DRAFT','SUBMITTED','APPROVED','POSTED','PAID','PARTIALLY_PAID','OVERDUE','CANCELLED');
create type payment_kind as enum ('VENDOR_PAYMENT','CUSTOMER_RECEIPT','EXPENSE','PETTY_CASH');
create type payment_method as enum ('CASH','BANK_TRANSFER','CHEQUE','CARD');
create type payment_status as enum ('DRAFT','POSTED','RECONCILED','CANCELLED');
create type asset_status as enum ('ACTIVE','DISPOSED','SOLD');

-- ---------- Departments ----------
create table departments (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  name          text not null,
  description   text,
  head_user_id  uuid,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------- Users ----------
create table users (
  id             uuid primary key default gen_random_uuid(),
  email          text unique not null,
  password_hash  text not null,
  full_name      text not null,
  role           user_role not null default 'VIEWER',
  department_id  uuid references departments(id),
  status         text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED')),
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- Currencies ----------
create table currencies (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  name           text not null,
  symbol         text not null default '',
  decimal_places int not null default 2,
  rate_to_base   numeric(20,6) not null default 1,
  is_base        boolean not null default false,
  is_active      boolean not null default true
);

-- ---------- Company / settings ----------
create table company_settings (
  id                   uuid primary key default gen_random_uuid(),
  company_name         text not null default 'Refinery Terminal',
  legal_name           text,
  tax_id               text,
  address              text,
  phone                text,
  email                text,
  website              text,
  base_currency_id     uuid references currencies(id),
  fiscal_year_start    int not null default 1, -- month (1=Jan)
  default_tax_rate_id  uuid,
  updated_at           timestamptz not null default now()
);

-- ---------- Chart of Accounts ----------
create table chart_of_accounts (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  name             text not null,
  type             account_type not null,
  category         text, -- sub-category within type
  parent_id        uuid references chart_of_accounts(id),
  normal_balance   text not null default 'DEBIT' check (normal_balance in ('DEBIT','CREDIT')),
  currency_id      uuid references currencies(id),
  is_active        boolean not null default true,
  is_system        boolean not null default false,
  description      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (code)
);

-- ---------- Journal entries (double entry) ----------
create table journal_entries (
  id               uuid primary key default gen_random_uuid(),
  entry_number     text unique not null,
  entry_date       date not null,
  fiscal_year      int not null,
  period           int not null check (period between 1 and 12),
  description      text not null,
  status           journal_status not null default 'DRAFT',
  source           text not null default 'MANUAL', -- MANUAL | INVOICE | PAYMENT | DEPRECIATION | REVERSAL
  created_by       uuid references users(id),
  approved_by      uuid references users(id),
  approved_at      timestamptz,
  posted_at        timestamptz,
  reversed_of_id   uuid references journal_entries(id),
  reversal_entry_id uuid references journal_entries(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table journal_lines (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references journal_entries(id) on delete cascade,
  line_no       int not null,
  account_id    uuid not null references chart_of_accounts(id),
  department_id uuid references departments(id),
  description   text,
  debit         numeric(20,2) not null default 0,
  credit        numeric(20,2) not null default 0
);

create index idx_journal_lines_entry on journal_lines(entry_id);
create index idx_journal_lines_account on journal_lines(account_id);
create index idx_journal_entries_date on journal_entries(entry_date);

-- ---------- Tax rates ----------
create table tax_rates (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  rate      numeric(10,4) not null default 0,
  is_active boolean not null default true
);

-- ---------- Vendors ----------
create table vendors (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique not null,
  name               text not null,
  tin                text,
  contact_person     text,
  email              text,
  phone              text,
  address            text,
  payment_terms_days int not null default 30,
  currency_id        uuid references currencies(id),
  bank_name          text,
  bank_account       text,
  status             text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------- Customers ----------
create table customers (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique not null,
  name               text not null,
  tin                text,
  contact_person     text,
  email              text,
  phone              text,
  address            text,
  payment_terms_days int not null default 30,
  currency_id        uuid references currencies(id),
  credit_limit       numeric(20,2),
  status             text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------- Invoices (AP supplier / AR customer) ----------
create table invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text unique not null,
  kind            invoice_kind not null,
  vendor_id       uuid references vendors(id),
  customer_id     uuid references customers(id),
  invoice_date    date not null,
  due_date        date,
  currency_id     uuid references currencies(id),
  status          invoice_status not null default 'DRAFT',
  subtotal        numeric(20,2) not null default 0,
  tax_amount      numeric(20,2) not null default 0,
  total           numeric(20,2) not null default 0,
  amount_paid     numeric(20,2) not null default 0,
  notes           text,
  approved_by     uuid references users(id),
  approved_at     timestamptz,
  posted_to_entry_id uuid references journal_entries(id),
  posted_at       timestamptz,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (kind = 'AP' and vendor_id is not null or kind = 'AR' and customer_id is not null)
);

create table invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  line_no     int not null,
  description text not null,
  quantity    numeric(20,4) not null default 1,
  unit_price  numeric(20,4) not null default 0,
  amount      numeric(20,2) not null default 0,
  account_id  uuid references chart_of_accounts(id),
  tax_rate_id uuid references tax_rates(id)
);

create index idx_invoices_kind on invoices(kind);
create index idx_invoices_status on invoices(status);
create index idx_invoices_due on invoices(due_date);

-- ---------- Bank accounts ----------
create table bank_accounts (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  bank_name        text not null,
  account_number   text,
  currency_id      uuid references currencies(id),
  gl_account_id    uuid references chart_of_accounts(id),
  opening_balance  numeric(20,2) not null default 0,
  is_active        boolean not null default true
);

-- ---------- Payments / receipts ----------
create table payments (
  id               uuid primary key default gen_random_uuid(),
  payment_number   text unique not null,
  kind             payment_kind not null,
  vendor_id        uuid references vendors(id),
  customer_id      uuid references customers(id),
  invoice_id       uuid references invoices(id),
  payment_date     date not null,
  currency_id      uuid references currencies(id),
  amount           numeric(20,2) not null default 0,
  method           payment_method not null default 'BANK_TRANSFER',
  bank_account_id  uuid references bank_accounts(id),
  reference        text,
  description      text,
  status           payment_status not null default 'DRAFT',
  created_by       uuid references users(id),
  posted_to_entry_id uuid references journal_entries(id),
  posted_at        timestamptz,
  reconciled_at    timestamptz,
  created_at       timestamptz not null default now()
);

create index idx_payments_kind on payments(kind);
create index idx_payments_status on payments(status);

-- ---------- Budgets ----------
create table budgets (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  fiscal_year   int not null,
  department_id uuid references departments(id),
  status        text not null default 'DRAFT' check (status in ('DRAFT','APPROVED','CLOSED')),
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  unique (fiscal_year, department_id)
);

create table budget_lines (
  id          uuid primary key default gen_random_uuid(),
  budget_id   uuid not null references budgets(id) on delete cascade,
  account_id  uuid not null references chart_of_accounts(id),
  month       int not null check (month between 1 and 12),
  amount      numeric(20,2) not null default 0,
  unique (budget_id, account_id, month)
);

-- ---------- Petty cash ----------
create table petty_cash_funds (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  fund_code       text unique not null,
  custodian_id    uuid references users(id),
  bank_account_id uuid references bank_accounts(id),
  opening_balance numeric(20,2) not null default 0,
  current_balance numeric(20,2) not null default 0,
  is_active       boolean not null default true
);

create table petty_cash_transactions (
  id           uuid primary key default gen_random_uuid(),
  fund_id      uuid not null references petty_cash_funds(id),
  tx_date      date not null,
  kind         text not null check (kind in ('EXPENSE','TOPUP','REPLENISH')),
  description  text not null,
  amount       numeric(20,2) not null default 0,
  receipt_ref  text,
  created_by   uuid references users(id),
  created_at   timestamptz not null default now()
);

-- ---------- Fixed assets ----------
create table fixed_assets (
  id                      uuid primary key default gen_random_uuid(),
  asset_code              text unique not null,
  name                    text not null,
  category                text,
  cost                    numeric(20,2) not null default 0,
  salvage_value           numeric(20,2) not null default 0,
  useful_life_years       int not null default 5,
  depreciation_method     text not null default 'STRAIGHT_LINE',
  acquired_date           date not null,
  status                  asset_status not null default 'ACTIVE',
  department_id           uuid references departments(id),
  accumulated_depreciation numeric(20,2) not null default 0,
  last_depreciation_date  date,
  created_at              timestamptz not null default now()
);

-- ---------- Audit log ----------
create table audit_logs (
  id          bigserial primary key,
  user_id     uuid references users(id),
  email       text,
  action      text not null,
  entity      text not null,
  entity_id   text,
  old_value   jsonb,
  new_value   jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index idx_audit_entity on audit_logs(entity, entity_id);
create index idx_audit_created on audit_logs(created_at);

-- ---------- Notifications ----------
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id),
  type       text not null default 'INFO',
  title      text not null,
  message    text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Updated_at triggers ----------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

create trigger trg_users_updated before update on users
  for each row execute function set_updated_at();
create trigger trg_coa_updated before update on chart_of_accounts
  for each row execute function set_updated_at();
create trigger trg_journals_updated before update on journal_entries
  for each row execute function set_updated_at();
create trigger trg_vendors_updated before update on vendors
  for each row execute function set_updated_at();
create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();
create trigger trg_invoices_updated before update on invoices
  for each row execute function set_updated_at();
