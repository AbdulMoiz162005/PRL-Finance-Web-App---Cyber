import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireMinRole } from '../middleware/rbac';
import { asyncHandler, ok, fail, pick } from '../utils/http';
import { uuid, nowIso, isoDate } from '../utils/id';
import { fundCode } from '../services/sequence';
import { auditLog } from '../services/audit';

const router = Router();
router.use(authMiddleware);

router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const funds = await db.select('petty_cash_funds');
  const users = await db.select('users');
  const userMap = new Map<string, any>(users.map((u) => [u.id, u]));
  ok(res, funds.map((f) => ({ ...f, custodian: f.custodian_id ? userMap.get(f.custodian_id)?.full_name : null })));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const fund = await db.selectOne('petty_cash_funds', { where: { id: req.params.id } });
  if (!fund) return fail(res, 404, 'Fund not found');
  const txs = await db.select('petty_cash_transactions', { where: { fund_id: fund.id }, order: { column: 'tx_date', dir: 'desc' } });
  const users = await db.select('users');
  const userMap = new Map<string, any>(users.map((u) => [u.id, u]));
  ok(res, { ...fund, transactions: txs.map((t) => ({ ...t, created_by_user: t.created_by ? userMap.get(t.created_by)?.full_name : null })) });
}));

const createSchema = z.object({
  name: z.string().min(2),
  custodian_id: z.string().nullable().optional(),
  bank_account_id: z.string().nullable().optional(),
  opening_balance: z.number().nonnegative().optional(),
});

router.post('/', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const body = createSchema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const fund = {
    id: uuid(),
    name: body.data.name,
    fund_code: await fundCode(),
    custodian_id: body.data.custodian_id || null,
    bank_account_id: body.data.bank_account_id || null,
    opening_balance: body.data.opening_balance ?? 0,
    current_balance: body.data.opening_balance ?? 0,
    is_active: true,
  };
  await db.insert('petty_cash_funds', fund);
  await auditLog({ user: req.user, action: 'CREATE_PETTY_CASH_FUND', entity: 'petty_cash_fund', entityId: fund.id, newValue: fund });
  ok(res, fund);
}));

const txSchema = z.object({
  tx_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(['EXPENSE', 'TOPUP', 'REPLENISH']),
  description: z.string().min(2),
  amount: z.number().positive(),
  receipt_ref: z.string().nullable().optional(),
});

router.post('/:id/transactions', requireMinRole('CASHIER'), asyncHandler(async (req, res) => {
  const body = txSchema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const fund = await db.selectOne('petty_cash_funds', { where: { id: req.params.id } });
  if (!fund) return fail(res, 404, 'Fund not found');
  const amount = body.data.kind === 'EXPENSE' ? -body.data.amount : body.data.amount;
  const newBalance = Math.round((fund.current_balance + amount) * 100) / 100;
  if (newBalance < 0) return fail(res, 400, 'Insufficient petty cash balance');
  const tx = {
    id: uuid(),
    fund_id: fund.id,
    tx_date: body.data.tx_date,
    kind: body.data.kind,
    description: body.data.description,
    amount: body.data.amount,
    receipt_ref: body.data.receipt_ref || null,
    created_by: req.user.id,
    created_at: nowIso(),
  };
  await db.insert('petty_cash_transactions', tx);
  await db.update('petty_cash_funds', { id: fund.id }, { current_balance: newBalance });
  await auditLog({ user: req.user, action: 'PETTY_CASH_TX', entity: 'petty_cash_fund', entityId: fund.id, newValue: tx });
  ok(res, { ...tx, current_balance: newBalance });
}));

router.put('/:id', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const body = z.object({ name: z.string().min(2).optional(), custodian_id: z.string().nullable().optional(), bank_account_id: z.string().nullable().optional(), is_active: z.boolean().optional() }).safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const fund = await db.selectOne('petty_cash_funds', { where: { id: req.params.id } });
  if (!fund) return fail(res, 404, 'Fund not found');
  const updated = await db.update('petty_cash_funds', { id: fund.id }, pick(body.data, ['name', 'custodian_id', 'bank_account_id', 'is_active']));
  await auditLog({ user: req.user, action: 'UPDATE_PETTY_CASH_FUND', entity: 'petty_cash_fund', entityId: fund.id });
  ok(res, updated);
}));

export default router;
