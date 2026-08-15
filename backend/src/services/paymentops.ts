import { DbAdapter } from '../db';
import { uuid, nowIso } from '../utils/id';
import { fiscalYearOf } from './ledger';
import { paymentNumber } from './sequence';
import { getSystemAccount, postEntry, createJournalEntry, CONTROL_ACCOUNTS } from './ledger';
import { auditLog } from './audit';

export type Row = Record<string, any>;

export interface PaymentInput {
  kind: 'VENDOR_PAYMENT' | 'CUSTOMER_RECEIPT' | 'EXPENSE' | 'PETTY_CASH';
  vendor_id?: string;
  customer_id?: string;
  invoice_id?: string;
  amount: number;
  payment_date: string;
  method: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD';
  bank_account_id?: string;
  reference?: string;
  description?: string;
  account_id?: string;
}

async function updateInvoicePaidStatus(db: DbAdapter, invoiceId: string) {
  const invoice = await db.selectOne('invoices', { where: { id: invoiceId } });
  if (!invoice) return;
  const payments = await db.select('payments', { where: { invoice_id: invoiceId } });
  const postedTotal = payments.filter((p) => ['POSTED', 'RECONCILED'].includes(p.status)).reduce((s, p) => s + (p.amount || 0), 0);
  const paid = Math.round(postedTotal * 100) / 100;
  let status = invoice.status;
  if (paid >= (invoice.total || 0)) status = 'PAID';
  else if (paid > 0) status = 'PARTIALLY_PAID';
  await db.update('invoices', { id: invoiceId }, { amount_paid: paid, status, updated_at: nowIso() });
}

export async function recordPayment(db: DbAdapter, user: Row, input: PaymentInput): Promise<Row> {
  if (!input.amount || input.amount <= 0) throw new Error('Payment amount must be positive');
  if (input.kind === 'VENDOR_PAYMENT' && !input.vendor_id) throw new Error('Vendor is required');
  if (input.kind === 'CUSTOMER_RECEIPT' && !input.customer_id) throw new Error('Customer is required');
  const year = fiscalYearOf(input.payment_date);
  const number = await paymentNumber(year);
  const id = uuid();
  const payment = {
    id,
    payment_number: number,
    kind: input.kind,
    vendor_id: input.kind === 'VENDOR_PAYMENT' ? input.vendor_id || null : null,
    customer_id: input.kind === 'CUSTOMER_RECEIPT' ? input.customer_id || null : null,
    invoice_id: input.invoice_id || null,
    payment_date: input.payment_date,
    currency_id: null,
    amount: Math.round(input.amount * 100) / 100,
    method: input.method,
    bank_account_id: input.bank_account_id || null,
    reference: input.reference || null,
    description: input.description || null,
    status: 'DRAFT',
    created_by: user.id,
    posted_to_entry_id: null,
    posted_at: null,
    reconciled_at: null,
    created_at: nowIso(),
  };
  await db.insert('payments', payment);
  await auditLog({ user, action: 'CREATE', entity: 'payment', entityId: id, newValue: payment });
  return payment;
}

export async function postPayment(db: DbAdapter, user: Row, payment: Row): Promise<Row> {
  if (payment.status === 'POSTED' || payment.status === 'RECONCILED') {
    if (payment.posted_to_entry_id) return payment;
  }
  if (payment.status === 'CANCELLED') throw new Error('Cancelled payment cannot be posted');

  const cashControl = await getSystemAccount(CONTROL_ACCOUNTS.CASH);
  const bank = payment.bank_account_id
    ? await db.selectOne('bank_accounts', { where: { id: payment.bank_account_id } })
    : null;
  const bankGl = bank?.gl_account_id
    ? await db.selectOne('chart_of_accounts', { where: { id: bank.gl_account_id } })
    : null;
  const cashAccount = bankGl || cashControl;
  if (!cashAccount) throw new Error('No cash/bank GL account configured');

  const lines: any[] = [];
  if (payment.kind === 'VENDOR_PAYMENT') {
    const ap = await getSystemAccount(CONTROL_ACCOUNTS.AP);
    if (!ap) throw new Error('AP control account not configured');
    lines.push({ account_id: ap.id, description: `Payment to vendor`, debit: payment.amount });
    lines.push({ account_id: cashAccount.id, description: `Cash/bank`, credit: payment.amount });
  } else if (payment.kind === 'CUSTOMER_RECEIPT') {
    const ar = await getSystemAccount(CONTROL_ACCOUNTS.AR);
    if (!ar) throw new Error('AR control account not configured');
    lines.push({ account_id: cashAccount.id, description: `Cash/bank`, debit: payment.amount });
    lines.push({ account_id: ar.id, description: `Receipt from customer`, credit: payment.amount });
  } else if (payment.kind === 'EXPENSE') {
    if (!payment.account_id) throw new Error('Expense account required for expense payment');
    const expense = await db.selectOne('chart_of_accounts', { where: { id: payment.account_id } });
    if (!expense) throw new Error('Expense account not found');
    lines.push({ account_id: expense.id, description: payment.description || 'Expense payment', debit: payment.amount });
    lines.push({ account_id: cashAccount.id, description: `Cash/bank`, credit: payment.amount });
  } else {
    const cash = await getSystemAccount(CONTROL_ACCOUNTS.CASH);
    lines.push({ account_id: payment.account_id || cash?.id || cashAccount.id, description: payment.description || 'Petty cash disbursement', debit: payment.amount });
    lines.push({ account_id: cashAccount.id, description: `Cash/bank`, credit: payment.amount });
  }

  const entry = await createJournalEntry(db, user, {
    entryDate: payment.payment_date,
    description: `${payment.payment_number} - ${payment.kind.replace('_', ' ')}`,
    source: 'PAYMENT',
    lines,
  }, { approvedBy: user.id });
  await postEntry(db, user, entry);
  const updated = await db.update('payments', { id: payment.id }, {
    status: 'POSTED',
    posted_to_entry_id: entry.id,
    posted_at: nowIso(),
  });
  if (payment.invoice_id) await updateInvoicePaidStatus(db, payment.invoice_id);
  await auditLog({ user, action: 'POST', entity: 'payment', entityId: payment.id });
  return { ...payment, ...(updated || {}) };
}

export async function reconcilePayment(db: DbAdapter, user: Row, payment: Row): Promise<Row> {
  if (payment.status !== 'POSTED') throw new Error('Only posted payments can be reconciled');
  const updated = await db.update('payments', { id: payment.id }, {
    status: 'RECONCILED',
    reconciled_at: nowIso(),
  });
  await auditLog({ user, action: 'RECONCILE', entity: 'payment', entityId: payment.id });
  return { ...payment, ...(updated || {}) };
}
