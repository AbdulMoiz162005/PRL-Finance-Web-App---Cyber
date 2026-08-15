export type Role = 'SUPER_ADMIN' | 'FINANCE_DIRECTOR' | 'FINANCE_MANAGER' | 'ACCOUNTANT' | 'CASHIER' | 'AUDITOR' | 'VIEWER';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  department_id?: string | null;
  department?: { id: string; name: string; code: string } | null;
  status: string;
  last_login_at?: string | null;
  created_at: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  category?: string | null;
  parent_id?: string | null;
  normal_balance: 'DEBIT' | 'CREDIT';
  currency_id?: string | null;
  is_active: boolean;
  is_system?: boolean;
  description?: string | null;
  balance?: number | null;
}

export interface JournalLine {
  id: string;
  account_id: string;
  department_id?: string | null;
  description?: string | null;
  debit: number;
  credit: number;
  account?: Account | null;
}

export interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  fiscal_year: number;
  period: number;
  description: string;
  status: 'DRAFT' | 'POSTED' | 'REVERSED';
  source: string;
  created_by?: string;
  approved_by?: string;
  created_at?: string | null;
  approved_at?: string | null;
  posted_at?: string | null;
  lines: JournalLine[];
  created_by_user?: string | null;
  approved_by_user?: string | null;
}

export interface Vendor {
  id: string;
  code: string;
  name: string;
  tin?: string | null;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  payment_terms_days: number;
  currency_id?: string | null;
  status: string;
  outstanding: number;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  tin?: string | null;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  payment_terms_days: number;
  credit_limit?: number | null;
  status: string;
  outstanding: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  kind: 'AP' | 'AR';
  vendor_id?: string | null;
  customer_id?: string | null;
  party?: { id: string; name: string } | null;
  invoice_date: string;
  due_date?: string | null;
  status: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  outstanding: number;
  notes?: string | null;
  approved_by?: string | null;
  approved_by_user?: string | null;
  posted_to_entry_id?: string | null;
  created_by_user?: string | null;
}

export interface Payment {
  id: string;
  payment_number: string;
  kind: string;
  vendor_id?: string | null;
  customer_id?: string | null;
  invoice_id?: string | null;
  vendor?: { id: string; name: string } | null;
  customer?: { id: string; name: string } | null;
  payment_date: string;
  amount: number;
  method: string;
  bank_account_id?: string | null;
  reference?: string | null;
  description?: string | null;
  status: string;
  created_by_user?: string | null;
}

export interface BankAccount {
  id: string;
  name: string;
  bank_name: string;
  account_number?: string | null;
  currency_id?: string | null;
  gl_account_id?: string | null;
  opening_balance: number;
  is_active: boolean;
  balance: number;
}

export interface Budget {
  id: string;
  name: string;
  fiscal_year: number;
  department_id?: string | null;
  department?: { id: string; name: string; code: string } | null;
  status: string;
  total: number;
}

export interface PettyCashFund {
  id: string;
  name: string;
  fund_code: string;
  custodian_id?: string | null;
  custodian?: string | null;
  bank_account_id?: string | null;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
}

export interface FixedAsset {
  id: string;
  asset_code: string;
  name: string;
  category?: string | null;
  cost: number;
  salvage_value: number;
  useful_life_years: number;
  acquired_date: string;
  status: string;
  department_id?: string | null;
  department?: string | null;
  accumulated_depreciation: number;
  net_book_value: number;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  head_user_id?: string | null;
  head?: string | null;
  is_active: boolean;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message?: string | null;
  is_read: boolean;
  created_at: string;
}

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  FINANCE_DIRECTOR: 'Finance Director',
  FINANCE_MANAGER: 'Finance Manager',
  ACCOUNTANT: 'Accountant',
  CASHIER: 'Cashier',
  AUDITOR: 'Auditor',
  VIEWER: 'Viewer',
};

export const ROLE_LEVEL: Record<Role, number> = {
  VIEWER: 0,
  AUDITOR: 1,
  CASHIER: 2,
  ACCOUNTANT: 3,
  FINANCE_MANAGER: 4,
  FINANCE_DIRECTOR: 5,
  SUPER_ADMIN: 6,
};
