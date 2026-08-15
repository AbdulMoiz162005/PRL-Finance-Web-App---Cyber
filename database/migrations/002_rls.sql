-- RLS migration for production parity
-- All application access goes through the backend API using the service_role key,
-- which bypasses RLS. These policies lock tables down so that no unauthenticated
-- (anon) or authenticated (supabase_auth.users) client can read or write data
-- directly via the PostgREST API.

create or replace function public.rt_enable_rls_all() returns void language plpgsql as $$
begin
  alter table public.departments enable row level security;
  alter table public.users enable row level security;
  alter table public.currencies enable row level security;
  alter table public.company_settings enable row level security;
  alter table public.chart_of_accounts enable row level security;
  alter table public.journal_entries enable row level security;
  alter table public.journal_lines enable row level security;
  alter table public.tax_rates enable row level security;
  alter table public.vendors enable row level security;
  alter table public.customers enable row level security;
  alter table public.invoices enable row level security;
  alter table public.invoice_lines enable row level security;
  alter table public.bank_accounts enable row level security;
  alter table public.payments enable row level security;
  alter table public.budgets enable row level security;
  alter table public.budget_lines enable row level security;
  alter table public.petty_cash_funds enable row level security;
  alter table public.petty_cash_transactions enable row level security;
  alter table public.fixed_assets enable row level security;
  alter table public.audit_logs enable row level security;
  alter table public.notifications enable row level security;
end $$;

select public.rt_enable_rls_all();

-- Explicitly revoke direct access for the public/anonymous roles.
-- The service_role keeps full access via the backend API.
revoke all on table public.departments from anon, authenticated;
revoke all on table public.users from anon, authenticated;
revoke all on table public.currencies from anon, authenticated;
revoke all on table public.company_settings from anon, authenticated;
revoke all on table public.chart_of_accounts from anon, authenticated;
revoke all on table public.journal_entries from anon, authenticated;
revoke all on table public.journal_lines from anon, authenticated;
revoke all on table public.tax_rates from anon, authenticated;
revoke all on table public.vendors from anon, authenticated;
revoke all on table public.customers from anon, authenticated;
revoke all on table public.invoices from anon, authenticated;
revoke all on table public.invoice_lines from anon, authenticated;
revoke all on table public.bank_accounts from anon, authenticated;
revoke all on table public.payments from anon, authenticated;
revoke all on table public.budgets from anon, authenticated;
revoke all on table public.budget_lines from anon, authenticated;
revoke all on table public.petty_cash_funds from anon, authenticated;
revoke all on table public.petty_cash_transactions from anon, authenticated;
revoke all on table public.fixed_assets from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;
revoke all on table public.notifications from anon, authenticated;

grant usage on schema public to service_role;
