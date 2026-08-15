import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireMinRole } from '../middleware/rbac';
import { asyncHandler, ok, fail } from '../utils/http';
import { uuid, nowIso } from '../utils/id';
import { auditLog } from '../services/audit';
import { budgetVsActual } from '../services/reports';

const router = Router();
router.use(authMiddleware);

router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const budgets = await db.select('budgets', { order: [{ column: 'fiscal_year', dir: 'desc' }, { column: 'created_at', dir: 'desc' }] });
  const depts = await db.select('departments');
  const deptMap = new Map<string, any>(depts.map((d) => [d.id, d]));
  const lines = await db.select('budget_lines');
  const byBudget = new Map<string, number>();
  for (const l of lines) byBudget.set(l.budget_id, (byBudget.get(l.budget_id) || 0) + (l.amount || 0));
  ok(res, budgets.map((b) => ({ ...b, department: b.department_id ? deptMap.get(b.department_id) || null : null, total: Math.round(byBudget.get(b.id) || 0) })));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const budget = await db.selectOne('budgets', { where: { id: req.params.id } });
  if (!budget) return fail(res, 404, 'Budget not found');
  const lines = await db.select('budget_lines', { where: { budget_id: budget.id } });
  const accounts = await db.select('chart_of_accounts');
  const accountMap = new Map<string, any>(accounts.map((a) => [a.id, a]));
  ok(res, {
    ...budget,
    lines: lines.map((l) => ({ ...l, account: accountMap.get(l.account_id) || null })),
  });
}));

const createSchema = z.object({
  name: z.string().min(2),
  fiscal_year: z.number().int().min(2000).max(2100),
  department_id: z.string().nullable().optional(),
  status: z.enum(['DRAFT', 'APPROVED', 'CLOSED']).optional(),
});

router.post('/', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const body = createSchema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const existing = await db.selectOne('budgets', { where: { fiscal_year: body.data.fiscal_year, department_id: body.data.department_id || null } });
  if (existing) return fail(res, 409, 'A budget already exists for this department and fiscal year');
  const budget = {
    id: uuid(),
    name: body.data.name,
    fiscal_year: body.data.fiscal_year,
    department_id: body.data.department_id || null,
    status: body.data.status || 'DRAFT',
    created_by: req.user.id,
    created_at: nowIso(),
  };
  await db.insert('budgets', budget);
  await auditLog({ user: req.user, action: 'CREATE_BUDGET', entity: 'budget', entityId: budget.id, newValue: budget });
  ok(res, budget);
}));

const lineSchema = z.object({
  account_id: z.string().min(1),
  month: z.number().int().min(1).max(12),
  amount: z.number().nonnegative(),
});

router.post('/:id/lines', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const body = z.object({ lines: z.array(lineSchema) }).safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const budget = await db.selectOne('budgets', { where: { id: req.params.id } });
  if (!budget) return fail(res, 404, 'Budget not found');
  const existing = await db.select('budget_lines', { where: { budget_id: budget.id } });
  for (const l of existing) {
    await db.remove('budget_lines', { id: l.id });
  }
  await db.insert('budget_lines', body.data.lines.map((l) => ({
    id: uuid(), budget_id: budget.id, account_id: l.account_id, month: l.month, amount: l.amount,
  })));
  await auditLog({ user: req.user, action: 'UPDATE_BUDGET_LINES', entity: 'budget', entityId: budget.id });
  ok(res, { message: 'Budget lines saved' });
}));

router.post('/:id/status', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const body = z.object({ status: z.enum(['DRAFT', 'APPROVED', 'CLOSED']) }).safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const budget = await db.selectOne('budgets', { where: { id: req.params.id } });
  if (!budget) return fail(res, 404, 'Budget not found');
  const updated = await db.update('budgets', { id: budget.id }, { status: body.data.status });
  await auditLog({ user: req.user, action: 'SET_BUDGET_STATUS', entity: 'budget', entityId: budget.id, newValue: { status: body.data.status } });
  ok(res, updated);
}));

router.get('/:id/vs-actual', asyncHandler(async (req, res) => {
  const db = getDb();
  const budget = await db.selectOne('budgets', { where: { id: req.params.id } });
  if (!budget) return fail(res, 404, 'Budget not found');
  const result = await budgetVsActual(budget.fiscal_year, budget.department_id);
  ok(res, result);
}));

export default router;
