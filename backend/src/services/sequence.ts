import { getDb } from '../db';

async function nextSuffixed(table: string, column: string, prefix: string, pad = 4): Promise<string> {
  const db = getDb();
  const rows = await db.select(table, { order: { column, dir: 'desc' }, limit: 5000 });
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const r of rows) {
    const m = String(r[column] || '').match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(pad, '0')}`;
}

export function journalNumber(year: number) {
  return nextSuffixed('journal_entries', 'entry_number', `JE-${year}-`, 4);
}

export function invoiceNumber(kind: 'AP' | 'AR', year: number) {
  return nextSuffixed('invoices', 'invoice_number', `${kind}-${year}-`, 4);
}

export function paymentNumber(year: number) {
  return nextSuffixed('payments', 'payment_number', `PMT-${year}-`, 4);
}

export function vendorCode() {
  return nextSuffixed('vendors', 'code', 'VND-', 3);
}

export function customerCode() {
  return nextSuffixed('customers', 'code', 'CUS-', 3);
}

export function assetCode() {
  return nextSuffixed('fixed_assets', 'asset_code', 'AST-', 3);
}

export function fundCode() {
  return nextSuffixed('petty_cash_funds', 'fund_code', 'PC-', 3);
}
