import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export const SQLITE_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS departments (
  id            TEXT PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  head_user_id  TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'VIEWER' CHECK (role IN ('SUPER_ADMIN','FINANCE_DIRECTOR','FINANCE_MANAGER','ACCOUNTANT','CASHIER','AUDITOR','VIEWER')),
  department_id  TEXT,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  last_login_at  TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS currencies (
  id             TEXT PRIMARY KEY,
  code           TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  symbol         TEXT NOT NULL DEFAULT '',
  decimal_places INTEGER NOT NULL DEFAULT 2,
  rate_to_base   REAL NOT NULL DEFAULT 1,
  is_base        INTEGER NOT NULL DEFAULT 0,
  is_active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS company_settings (
  id                   TEXT PRIMARY KEY,
  company_name         TEXT NOT NULL DEFAULT 'Refinery Terminal',
  legal_name           TEXT,
  tax_id               TEXT,
  address              TEXT,
  phone                TEXT,
  email                TEXT,
  website              TEXT,
  base_currency_id     TEXT,
  fiscal_year_start    INTEGER NOT NULL DEFAULT 1,
  default_tax_rate_id  TEXT,
  updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  category         TEXT,
  parent_id        TEXT,
  normal_balance   TEXT NOT NULL DEFAULT 'DEBIT' CHECK (normal_balance IN ('DEBIT','CREDIT')),
  currency_id      TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  is_system        INTEGER NOT NULL DEFAULT 0,
  description      TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id                TEXT PRIMARY KEY,
  entry_number      TEXT UNIQUE NOT NULL,
  entry_date        TEXT NOT NULL,
  fiscal_year       INTEGER NOT NULL,
  period            INTEGER NOT NULL CHECK (period BETWEEN 1 AND 12),
  description       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','REVERSED')),
  source            TEXT NOT NULL DEFAULT 'MANUAL',
  created_by        TEXT,
  approved_by       TEXT,
  approved_at       TEXT,
  posted_at         TEXT,
  reversed_of_id    TEXT,
  reversal_entry_id TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);

CREATE TABLE IF NOT EXISTS journal_lines (
  id            TEXT PRIMARY KEY,
  entry_id      TEXT NOT NULL,
  line_no       INTEGER NOT NULL,
  account_id    TEXT NOT NULL,
  department_id TEXT,
  description   TEXT,
  debit         REAL NOT NULL DEFAULT 0,
  credit        REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);

CREATE TABLE IF NOT EXISTS tax_rates (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  rate      REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS vendors (
  id                 TEXT PRIMARY KEY,
  code               TEXT UNIQUE NOT NULL,
  name               TEXT NOT NULL,
  tin                TEXT,
  contact_person     TEXT,
  email              TEXT,
  phone              TEXT,
  address            TEXT,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  currency_id        TEXT,
  bank_name          TEXT,
  bank_account       TEXT,
  status             TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id                 TEXT PRIMARY KEY,
  code               TEXT UNIQUE NOT NULL,
  name               TEXT NOT NULL,
  tin                TEXT,
  contact_person     TEXT,
  email              TEXT,
  phone              TEXT,
  address            TEXT,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  currency_id        TEXT,
  credit_limit       REAL,
  status             TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id                 TEXT PRIMARY KEY,
  invoice_number     TEXT UNIQUE NOT NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('AP','AR')),
  vendor_id          TEXT,
  customer_id        TEXT,
  invoice_date       TEXT NOT NULL,
  due_date           TEXT,
  currency_id        TEXT,
  status             TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','POSTED','PAID','PARTIALLY_PAID','OVERDUE','CANCELLED')),
  subtotal           REAL NOT NULL DEFAULT 0,
  tax_amount         REAL NOT NULL DEFAULT 0,
  total              REAL NOT NULL DEFAULT 0,
  amount_paid        REAL NOT NULL DEFAULT 0,
  notes              TEXT,
  approved_by        TEXT,
  approved_at        TEXT,
  posted_to_entry_id TEXT,
  posted_at          TEXT,
  created_by         TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_kind ON invoices(kind);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id          TEXT PRIMARY KEY,
  invoice_id  TEXT NOT NULL,
  line_no     INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity    REAL NOT NULL DEFAULT 1,
  unit_price  REAL NOT NULL DEFAULT 0,
  amount      REAL NOT NULL DEFAULT 0,
  account_id  TEXT,
  tax_rate_id TEXT
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  bank_name       TEXT NOT NULL,
  account_number  TEXT,
  currency_id     TEXT,
  gl_account_id   TEXT,
  opening_balance REAL NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS payments (
  id               TEXT PRIMARY KEY,
  payment_number   TEXT UNIQUE NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('VENDOR_PAYMENT','CUSTOMER_RECEIPT','EXPENSE','PETTY_CASH')),
  vendor_id        TEXT,
  customer_id      TEXT,
  invoice_id       TEXT,
  payment_date     TEXT NOT NULL,
  currency_id      TEXT,
  amount           REAL NOT NULL DEFAULT 0,
  method           TEXT NOT NULL DEFAULT 'BANK_TRANSFER' CHECK (method IN ('CASH','BANK_TRANSFER','CHEQUE','CARD')),
  bank_account_id  TEXT,
  reference        TEXT,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','RECONCILED','CANCELLED')),
  created_by       TEXT,
  posted_to_entry_id TEXT,
  posted_at        TEXT,
  reconciled_at    TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_kind ON payments(kind);

CREATE TABLE IF NOT EXISTS budgets (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  fiscal_year   INTEGER NOT NULL,
  department_id TEXT,
  status        TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','CLOSED')),
  created_by    TEXT,
  created_at    TEXT NOT NULL,
  UNIQUE (fiscal_year, department_id)
);

CREATE TABLE IF NOT EXISTS budget_lines (
  id          TEXT PRIMARY KEY,
  budget_id   TEXT NOT NULL,
  account_id  TEXT NOT NULL,
  month       INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount      REAL NOT NULL DEFAULT 0,
  UNIQUE (budget_id, account_id, month)
);

CREATE TABLE IF NOT EXISTS petty_cash_funds (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  fund_code       TEXT UNIQUE NOT NULL,
  custodian_id    TEXT,
  bank_account_id TEXT,
  opening_balance REAL NOT NULL DEFAULT 0,
  current_balance REAL NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS petty_cash_transactions (
  id          TEXT PRIMARY KEY,
  fund_id     TEXT NOT NULL,
  tx_date     TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('EXPENSE','TOPUP','REPLENISH')),
  description TEXT NOT NULL,
  amount      REAL NOT NULL DEFAULT 0,
  receipt_ref TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fixed_assets (
  id                       TEXT PRIMARY KEY,
  asset_code               TEXT UNIQUE NOT NULL,
  name                     TEXT NOT NULL,
  category                 TEXT,
  cost                     REAL NOT NULL DEFAULT 0,
  salvage_value            REAL NOT NULL DEFAULT 0,
  useful_life_years        INTEGER NOT NULL DEFAULT 5,
  depreciation_method      TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
  acquired_date            TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISPOSED','SOLD')),
  department_id            TEXT,
  accumulated_depreciation REAL NOT NULL DEFAULT 0,
  last_depreciation_date   TEXT,
  created_at               TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT,
  email      TEXT,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  old_value  TEXT,
  new_value  TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'INFO',
  title      TEXT NOT NULL,
  message    TEXT,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`;

export function openSqlite(file: string): Database.Database {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SQLITE_SCHEMA);
  return db;
}
