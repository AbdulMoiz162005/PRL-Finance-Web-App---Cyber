import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireMinRole } from '../middleware/rbac';
import { asyncHandler, ok, fail, pick } from '../utils/http';
import { uuid, nowIso } from '../utils/id';
import { auditLog } from '../services/audit';
import { accountBalance } from '../services/ledger';

const router = Router();
router.use(authMiddleware);

router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const type = req.query.type as string | undefined;
  const asOf = req.query.asOf as string | undefined;
  const accounts = await db.select('chart_of_accounts', { order: { column: 'code' } });
  const filtered = type ? accounts.filter((a) => a.type === type) : accounts;
  const rows: any[] = [];
  for (const a of filtered) {
    const bal = asOf ? await accountBalance(a.id, asOf) : null;
    rows.push({ ...a, balance: bal });
  }
  ok(res, rows);
}));

router.get('/tree', asyncHandler(async (req, res) => {
  const db = getDb();
  const asOf = req.query.asOf as string | undefined;
  const accounts = await db.select('chart_of_accounts', { order: { column: 'code' } });
  const balances = new Map<string, number>();
  if (asOf) {
    for (const a of accounts) {
      const b = await accountBalance(a.id, asOf);
      if (b !== 0) balances.set(a.id, b);
    }
  }
  const childrenOf = (parent: string | null): any[] => {
    return accounts.filter((a) => (a.parent_id || null) === parent).map((a) => ({
      ...a,
      balance: balances.get(a.id) ?? null,
      children: childrenOf(a.id),
    }));
  };
  ok(res, {
    asset: childrenOf(null).filter((a) => a.type === 'ASSET'),
    liability: childrenOf(null).filter((a) => a.type === 'LIABILITY'),
    equity: childrenOf(null).filter((a) => a.type === 'EQUITY'),
    revenue: childrenOf(null).filter((a) => a.type === 'REVENUE'),
    expense: childrenOf(null).filter((a) => a.type === 'EXPENSE'),
  });
}));

router.get('/:id/ledger', asyncHandler(async (req, res) => {
  const db = getDb();
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const account = await db.selectOne('chart_of_accounts', { where: { id: req.params.id } });
  if (!account) return fail(res, 404, 'Account not found');
  const { gl } = await import('../services/reports');
  const result = await gl(account.id, from, to);
  ok(res, result);
}));

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  category: z.string().nullable().optional(),
  parent_id: z.string().nullable().optional(),
  normal_balance: z.enum(['DEBIT', 'CREDIT']).optional(),
  currency_id: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

router.post('/', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const body = schema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const existing = await db.selectOne('chart_of_accounts', { where: { code: body.data.code } });
  if (existing) return fail(res, 409, 'Account code already exists');
  const account = {
    id: uuid(),
    code: body.data.code,
    name: body.data.name,
    type: body.data.type,
    category: body.data.category || null,
    parent_id: body.data.parent_id || null,
    normal_balance: body.data.normal_balance || (body.data.type === 'ASSET' || body.data.type === 'EXPENSE' ? 'DEBIT' : 'CREDIT'),
    currency_id: body.data.currency_id || null,
    is_active: body.data.is_active ?? true,
    is_system: false,
    description: body.data.description || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await db.insert('chart_of_accounts', account);
  await auditLog({ user: req.user, action: 'CREATE_ACCOUNT', entity: 'account', entityId: account.id, newValue: account });
  ok(res, account);
}));

router.put('/:id', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const body = schema.partial().safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const account = await db.selectOne('chart_of_accounts', { where: { id: req.params.id } });
  if (!account) return fail(res, 404, 'Account not found');
  const updated = await db.update('chart_of_accounts', { id: account.id }, {
    ...pick(body.data, ['name', 'category', 'parent_id', 'currency_id', 'description', 'is_active']),
    updated_at: nowIso(),
  });
  await auditLog({ user: req.user, action: 'UPDATE_ACCOUNT', entity: 'account', entityId: account.id, newValue: updated });
  ok(res, updated);
}));

export default router;
