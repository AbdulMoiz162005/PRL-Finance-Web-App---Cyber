import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireMinRole } from '../middleware/rbac';
import { asyncHandler, ok, fail, pick } from '../utils/http';
import { uuid, nowIso } from '../utils/id';
import { auditLog } from '../services/audit';
import { accountBalance } from '../services/ledger';
import { getPostedLines } from '../services/ledger';

const router = Router();
router.use(authMiddleware);

router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const banks = await db.select('bank_accounts', { order: { column: 'name' } });
  const okRows: any[] = [];
  for (const b of banks) {
    const balance = await accountBalance(b.gl_account_id || 'none', undefined).catch(() => 0);
    okRows.push({ ...b, balance: Math.round(balance * 100) / 100 });
  }
  ok(res, okRows);
}));

router.get('/:id/transactions', asyncHandler(async (req, res) => {
  const db = getDb();
  const bank = await db.selectOne('bank_accounts', { where: { id: req.params.id } });
  if (!bank) return fail(res, 404, 'Bank account not found');
  if (!bank.gl_account_id) return ok(res, { bank, rows: [], balance: 0 });
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const lines = await getPostedLines(from, to, bank.gl_account_id);
  const rows = lines.map((l) => ({
    entry_number: l.entry_number,
    date: l.entry_date,
    description: l.line.description || l.entry_number,
    debit: l.line.debit || 0,
    credit: l.line.credit || 0,
  }));
  const balance = await accountBalance(bank.gl_account_id);
  ok(res, { bank, rows, balance: Math.round(balance * 100) / 100 });
}));

const schema = z.object({
  name: z.string().min(1),
  bank_name: z.string().min(1),
  account_number: z.string().nullable().optional(),
  currency_id: z.string().nullable().optional(),
  gl_account_id: z.string().nullable().optional(),
  opening_balance: z.number().optional(),
  is_active: z.boolean().optional(),
});

router.post('/', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const body = schema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const bank = {
    id: uuid(),
    name: body.data.name,
    bank_name: body.data.bank_name,
    account_number: body.data.account_number || null,
    currency_id: body.data.currency_id || null,
    gl_account_id: body.data.gl_account_id || null,
    opening_balance: body.data.opening_balance ?? 0,
    is_active: body.data.is_active ?? true,
  };
  await db.insert('bank_accounts', bank);
  await auditLog({ user: req.user, action: 'CREATE_BANK_ACCOUNT', entity: 'bank_account', entityId: bank.id, newValue: bank });
  ok(res, bank);
}));

router.put('/:id', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const body = schema.partial().safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const bank = await db.selectOne('bank_accounts', { where: { id: req.params.id } });
  if (!bank) return fail(res, 404, 'Bank account not found');
  const updated = await db.update('bank_accounts', { id: bank.id }, pick(body.data, ['name', 'bank_name', 'account_number', 'currency_id', 'gl_account_id', 'opening_balance', 'is_active']));
  await auditLog({ user: req.user, action: 'UPDATE_BANK_ACCOUNT', entity: 'bank_account', entityId: bank.id, newValue: updated });
  ok(res, updated);
}));

export default router;
