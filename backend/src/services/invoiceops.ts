import { DbAdapter } from '../db';
import { uuid, nowIso } from '../utils/id';
import { invoiceNumber } from './sequence';
import { getSystemAccount, postEntry, createJournalEntry, CONTROL_ACCOUNTS, fiscalYearOf, periodOf } from './ledger';
import { auditLog } from './audit';

export type Row = Record<string, any>;

export interface InvoiceLineInput {
  description: string;
  quantity?: number;
  unit_price?: number;
  account_id?: string;
  tax_rate_id?: string;
}

export interface InvoiceInput {
  kind: 'AP' | 'AR';
  vendor_id?: string;
  customer_id?: string;
  invoice_date: string;
  due_date?: string;
  currency_id?: string;
  notes?: string;
  lines: InvoiceLineInput[];
}

export async function computeInvoice(lines: InvoiceLineInput[], taxRates: Row[]): Promise<{ lines: Row[]; subtotal: number; tax_amount: number; total: number }> {
  const taxMap = new Map(taxRates.map((t) => [t.id, t]));
  let subtotal = 0;
  let tax_amount = 0;
  const out = lines.map((l, i) => {
    const qty = l.quantity || 1;
    const price = l.unit_price || 0;
    const amount = Math.round(qty * price * 100) / 100;
    const rate = l.tax_rate_id ? (taxMap.get(l.tax_rate_id)?.rate || 0) : 0;
    const tax = Math.round((amount * rate) / 100 * 100) / 100;
    subtotal += amount;
    tax_amount += tax;
    return {
      id: uuid(),
      line_no: i + 1,
      description: l.description,
      quantity: qty,
      unit_price: price,
      amount,
      account_id: l.account_id || null,
      tax_rate_id: l.tax_rate_id || null,
      tax: tax,
    };
  });
  return { lines: out, subtotal: Math.round(subtotal * 100) / 100, tax_amount: Math.round(tax_amount * 100) / 100, total: Math.round((subtotal + tax_amount) * 100) / 100 };
}

export async function createInvoiceEntry(
  db: DbAdapter,
  user: Row,
  input: InvoiceInput,
  opts?: { autoPost?: boolean; approvedBy?: string }
): Promise<Row> {
  if (input.lines.length === 0) throw new Error('Invoice requires at least one line');
  const taxRates = await db.select('tax_rates');
  const computed = await computeInvoice(input.lines, taxRates);
  const year = fiscalYearOf(input.invoice_date);
  const number = await invoiceNumber(input.kind, year);
  const id = uuid();
  const invoice = {
    id,
    invoice_number: number,
    kind: input.kind,
    vendor_id: input.kind === 'AP' ? input.vendor_id || null : null,
    customer_id: input.kind === 'AR' ? input.customer_id || null : null,
    invoice_date: input.invoice_date,
    due_date: input.due_date || null,
    currency_id: input.currency_id || null,
    status: 'DRAFT',
    subtotal: computed.subtotal,
    tax_amount: computed.tax_amount,
    total: computed.total,
    amount_paid: 0,
    notes: input.notes || null,
    approved_by: null,
    approved_at: null,
    posted_to_entry_id: null,
    posted_at: null,
    created_by: user.id,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await db.insert('invoices', invoice);
  await db.insert('invoice_lines', computed.lines.map((l) => ({
    id: l.id,
    invoice_id: id,
    line_no: l.line_no,
    description: l.description,
    quantity: l.quantity,
    unit_price: l.unit_price,
    amount: l.amount,
    account_id: l.account_id,
    tax_rate_id: l.tax_rate_id,
  })));
  await auditLog({ user, action: 'CREATE', entity: 'invoice', entityId: id, newValue: invoice });
  if (opts?.autoPost) {
    const approvedBy = opts.approvedBy || user.id;
    await db.update('invoices', { id }, { status: 'APPROVED', approved_by: approvedBy, approved_at: nowIso(), updated_at: nowIso() });
    const posted = await postInvoice(db, user, id);
    return { ...invoice, lines: computed.lines, ...posted };
  }
  return { ...invoice, lines: computed.lines };
}

export async function submitInvoice(db: DbAdapter, user: Row, invoice: Row): Promise<Row> {
  if (invoice.status !== 'DRAFT') throw new Error('Only draft invoices can be submitted');
  const updated = await db.update('invoices', { id: invoice.id }, { status: 'SUBMITTED', updated_at: nowIso() });
  await auditLog({ user, action: 'SUBMIT', entity: 'invoice', entityId: invoice.id });
  return updated || invoice;
}

export async function approveInvoice(db: DbAdapter, user: Row, invoice: Row): Promise<Row> {
  if (!['SUBMITTED', 'DRAFT'].includes(invoice.status)) throw new Error('Invoice cannot be approved from current status');
  const updated = await db.update('invoices', { id: invoice.id }, {
    status: 'APPROVED',
    approved_by: user.id,
    approved_at: nowIso(),
    updated_at: nowIso(),
  });
  await auditLog({ user, action: 'APPROVE', entity: 'invoice', entityId: invoice.id });
  return updated || invoice;
}

export async function postInvoice(db: DbAdapter, user: Row, invoiceId: string): Promise<Row> {
  const invoice = await db.selectOne('invoices', { where: { id: invoiceId } });
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status === 'POSTED' && invoice.posted_to_entry_id) return invoice;
  if (!['APPROVED', 'POSTED'].includes(invoice.status)) throw new Error('Invoice must be approved before posting');
  const lines = await db.select('invoice_lines', { where: { invoice_id: invoiceId } });
  const arControl = await getSystemAccount(CONTROL_ACCOUNTS.AR);
  const apControl = await getSystemAccount(CONTROL_ACCOUNTS.AP);
  const vatPay = await getSystemAccount(CONTROL_ACCOUNTS.VAT_PAYABLE);
  const vatRec = await getSystemAccount(CONTROL_ACCOUNTS.VAT_RECOVERABLE);

  const ledgerLines: any[] = [];
  if (invoice.kind === 'AR') {
    if (!arControl) throw new Error('AR control account (1110) not configured');
    ledgerLines.push({ account_id: arControl.id, description: 'Trade receivables', debit: invoice.total });
    for (const l of lines) {
      const account = l.account_id ? await db.selectOne('chart_of_accounts', { where: { id: l.account_id } }) : null;
      if (account && account.type !== 'REVENUE') throw new Error('AR invoice line account must be a revenue account');
      ledgerLines.push({ account_id: account?.id || arControl.id, description: l.description, credit: l.amount });
    }
    if ((invoice.tax_amount || 0) > 0) {
      if (!vatPay) throw new Error('VAT Payable account (2210) not configured');
      ledgerLines.push({ account_id: vatPay.id, description: 'Output VAT', credit: invoice.tax_amount });
    }
  } else {
    if (!apControl) throw new Error('AP control account (2010) not configured');
    for (const l of lines) {
      const account = l.account_id ? await db.selectOne('chart_of_accounts', { where: { id: l.account_id } }) : null;
      if (account && account.type !== 'EXPENSE' && account.type !== 'ASSET') {
        throw new Error('AP invoice line account must be expense or asset account');
      }
      ledgerLines.push({ account_id: account?.id || apControl.id, description: l.description, debit: l.amount });
    }
    if ((invoice.tax_amount || 0) > 0) {
      if (!vatRec) throw new Error('VAT Recoverable account (1520) not configured');
      ledgerLines.push({ account_id: vatRec.id, description: 'Input VAT', debit: invoice.tax_amount });
    }
    ledgerLines.push({ account_id: apControl.id, description: `Payable to vendor`, credit: invoice.total });
  }

  const entry = await createJournalEntry(db, user, {
    entryDate: invoice.invoice_date,
    description: `${invoice.kind === 'AR' ? 'Customer invoice' : 'Supplier invoice'} ${invoice.invoice_number}`,
    source: 'INVOICE',
    lines: ledgerLines,
  }, { approvedBy: user.id });
  await postEntry(db, user, entry);
  const updated = await db.update('invoices', { id: invoiceId }, {
    status: 'POSTED',
    posted_to_entry_id: entry.id,
    posted_at: nowIso(),
    approved_by: user.id,
    approved_at: nowIso(),
    updated_at: nowIso(),
  });
  await auditLog({ user, action: 'POST', entity: 'invoice', entityId: invoiceId });
  return { ...invoice, ...(updated || {}) };
}
