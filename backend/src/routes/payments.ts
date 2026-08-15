import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireMinRole } from '../middleware/rbac';
import { asyncHandler, ok, fail } from '../utils/http';
import { recordPayment, postPayment, reconcilePayment } from '../services/paymentops';

const router = Router();
router.use(authMiddleware);

async function decorate(db: any, rows: any[]) {
  const vendors = await db.select('vendors');
  const customers = await db.select('customers');
  const banks = await db.select('bank_accounts');
  const users = await db.select('users');
  const vMap = new Map<string, any>(vendors.map((v: any) => [v.id, v]));
  const cMap = new Map<string, any>(customers.map((c: any) => [c.id, c]));
  const bMap = new Map<string, any>(banks.map((b: any) => [b.id, b]));
  const uMap = new Map<string, any>(users.map((u: any) => [u.id, u]));
  return rows.map((p) => ({
    ...p,
    vendor: p.vendor_id ? { id: p.vendor_id, name: vMap.get(p.vendor_id)?.name } : null,
    customer: p.customer_id ? { id: p.customer_id, name: cMap.get(p.customer_id)?.name } : null,
    bank_account: p.bank_account_id ? bMap.get(p.bank_account_id) || null : null,
    created_by_user: p.created_by ? uMap.get(p.created_by)?.full_name || null : null,
  }));
}

router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const { kind, status } = req.query;
  const payments = await db.select('payments', { order: { column: 'payment_date', dir: 'desc' } });
  let filtered = payments;
  if (kind) filtered = filtered.filter((p) => p.kind === kind);
  if (status) filtered = filtered.filter((p) => p.status === status);
  ok(res, await decorate(db, filtered));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const payment = await db.selectOne('payments', { where: { id: req.params.id } });
  if (!payment) return fail(res, 404, 'Payment not found');
  const [decorated] = await decorate(db, [payment]);
  ok(res, decorated);
}));

const createSchema = z.object({
  kind: z.enum(['VENDOR_PAYMENT', 'CUSTOMER_RECEIPT', 'EXPENSE', 'PETTY_CASH']),
  vendor_id: z.string().nullable().optional(),
  customer_id: z.string().nullable().optional(),
  invoice_id: z.string().nullable().optional(),
  amount: z.number().positive(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD']),
  bank_account_id: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  account_id: z.string().nullable().optional(),
});

router.post('/', requireMinRole('CASHIER'), asyncHandler(async (req, res) => {
  const body = createSchema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const payment = await recordPayment(db, req.user, body.data as any);
  ok(res, payment);
}));

router.post('/:id/post', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const db = getDb();
  const payment = await db.selectOne('payments', { where: { id: req.params.id } });
  if (!payment) return fail(res, 404, 'Payment not found');
  const posted = await postPayment(db, req.user, payment);
  ok(res, posted);
}));

router.post('/:id/reconcile', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const db = getDb();
  const payment = await db.selectOne('payments', { where: { id: req.params.id } });
  if (!payment) return fail(res, 404, 'Payment not found');
  const reconciled = await reconcilePayment(db, req.user, payment);
  ok(res, reconciled);
}));

router.post('/:id/cancel', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const db = getDb();
  const payment = await db.selectOne('payments', { where: { id: req.params.id } });
  if (!payment) return fail(res, 404, 'Payment not found');
  if (payment.status === 'RECONCILED') return fail(res, 400, 'Reconciled payments cannot be cancelled');
  const updated = await db.update('payments', { id: payment.id }, { status: 'CANCELLED' });
  ok(res, updated);
}));

export default router;
