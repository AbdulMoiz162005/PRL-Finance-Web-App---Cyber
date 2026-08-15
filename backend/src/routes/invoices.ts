import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireMinRole, ROLE_HIERARCHY } from '../middleware/rbac';
import { asyncHandler, ok, fail } from '../utils/http';
import { createInvoiceEntry, submitInvoice, approveInvoice, postInvoice } from '../services/invoiceops';
import { auditLog } from '../services/audit';

const router = Router();
router.use(authMiddleware);

async function decorate(db: any, invoices: any[]) {
  const parties: any = { AP: await db.select('vendors'), AR: await db.select('customers') };
  const apMap = new Map(parties.AP.map((v: any) => [v.id, v]));
  const arMap = new Map(parties.AR.map((c: any) => [c.id, c]));
  const users = await db.select('users');
  const userMap = new Map<string, any>(users.map((u: any) => [u.id, u]));
  return invoices.map((inv) => ({
    ...inv,
    party: inv.kind === 'AP' ? apMap.get(inv.vendor_id) || null : arMap.get(inv.customer_id) || null,
    created_by_user: inv.created_by ? userMap.get(inv.created_by)?.full_name || null : null,
    approved_by_user: inv.approved_by ? userMap.get(inv.approved_by)?.full_name || null : null,
    outstanding: Math.round((inv.total || 0) - (inv.amount_paid || 0)),
  }));
}

router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const { kind, status } = req.query;
  const invoices = await db.select('invoices', { order: [{ column: 'invoice_date', dir: 'desc' }, { column: 'created_at', dir: 'desc' }] });
  let filtered = invoices;
  if (kind) filtered = filtered.filter((i) => i.kind === kind);
  if (status) filtered = filtered.filter((i) => i.status === status);
  ok(res, await decorate(db, filtered));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const invoice = await db.selectOne('invoices', { where: { id: req.params.id } });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  const [decorated] = await decorate(db, [invoice]);
  const lines = await db.select('invoice_lines', { where: { invoice_id: invoice.id }, order: { column: 'line_no' } });
  const accounts = await db.select('chart_of_accounts');
  const accountMap = new Map<string, any>(accounts.map((a: any) => [a.id, a]));
  const taxRates = await db.select('tax_rates');
  const taxMap = new Map(taxRates.map((t: any) => [t.id, t]));
  const payments = await db.select('payments', { where: { invoice_id: invoice.id } });
  ok(res, {
    ...decorated,
    lines: lines.map((l: any) => ({ ...l, account: accountMap.get(l.account_id) || null, tax_rate: taxMap.get(l.tax_rate_id) || null })),
    payments,
  });
}));

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().nonnegative().optional(),
  unit_price: z.number().nonnegative().optional(),
  account_id: z.string().nullable().optional(),
  tax_rate_id: z.string().nullable().optional(),
});

const createSchema = z.object({
  kind: z.enum(['AP', 'AR']),
  vendor_id: z.string().nullable().optional(),
  customer_id: z.string().nullable().optional(),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  currency_id: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1),
});

router.post('/', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const body = createSchema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  if (body.data.kind === 'AP' && !body.data.vendor_id) return fail(res, 422, 'Vendor is required for supplier invoices');
  if (body.data.kind === 'AR' && !body.data.customer_id) return fail(res, 422, 'Customer is required for customer invoices');
  const invoice = await createInvoiceEntry(db, req.user, body.data as any);
  ok(res, invoice);
}));

router.post('/:id/submit', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const db = getDb();
  const invoice = await db.selectOne('invoices', { where: { id: req.params.id } });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  const updated = await submitInvoice(db, req.user, invoice);
  ok(res, updated);
}));

router.post('/:id/approve', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const db = getDb();
  const invoice = await db.selectOne('invoices', { where: { id: req.params.id } });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  const updated = await approveInvoice(db, req.user, invoice);
  ok(res, updated);
}));

router.post('/:id/post', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const db = getDb();
  const invoice = await db.selectOne('invoices', { where: { id: req.params.id } });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  const isManager = (ROLE_HIERARCHY[req.user.role] || 0) >= ROLE_HIERARCHY.FINANCE_MANAGER;
  if (!isManager && invoice.status !== 'APPROVED') {
    return fail(res, 403, 'Invoice must be approved by a Finance Manager or Director before posting');
  }
  const posted = await postInvoice(db, req.user, invoice.id);
  ok(res, posted);
}));

router.post('/:id/cancel', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const db = getDb();
  const invoice = await db.selectOne('invoices', { where: { id: req.params.id } });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  if (['PAID', 'POSTED'].includes(invoice.status)) return fail(res, 400, 'Posted/paid invoices cannot be cancelled');
  const updated = await db.update('invoices', { id: invoice.id }, { status: 'CANCELLED', updated_at: new Date().toISOString() });
  await auditLog({ user: req.user, action: 'CANCEL', entity: 'invoice', entityId: invoice.id });
  ok(res, updated);
}));

router.delete('/:id', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const db = getDb();
  const invoice = await db.selectOne('invoices', { where: { id: req.params.id } });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  if (invoice.status !== 'DRAFT') return fail(res, 400, 'Only draft invoices can be deleted');
  await db.remove('invoice_lines', { invoice_id: invoice.id });
  await db.remove('invoices', { id: invoice.id });
  await auditLog({ user: req.user, action: 'DELETE', entity: 'invoice', entityId: invoice.id });
  ok(res, { message: 'Invoice deleted' });
}));

export default router;
