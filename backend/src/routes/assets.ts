import { Router } from 'express';
import dayjs from 'dayjs';
import { z } from 'zod';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireMinRole } from '../middleware/rbac';
import { asyncHandler, ok, fail, pick } from '../utils/http';
import { uuid, nowIso, isoDate } from '../utils/id';
import { assetCode } from '../services/sequence';
import { getSystemAccount, postLinesToLedger, CONTROL_ACCOUNTS } from '../services/ledger';
import { auditLog } from '../services/audit';

const router = Router();
router.use(authMiddleware);

router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const assets = await db.select('fixed_assets', { order: { column: 'asset_code' } });
  const depts = await db.select('departments');
  const deptMap = new Map<string, any>(depts.map((d) => [d.id, d]));
  ok(res, assets.map((a) => ({
    ...a,
    department: a.department_id ? deptMap.get(a.department_id)?.name || null : null,
    net_book_value: Math.round(((a.cost || 0) - (a.accumulated_depreciation || 0)) * 100) / 100,
  })));
}));

const createSchema = z.object({
  name: z.string().min(2),
  category: z.string().nullable().optional(),
  cost: z.number().positive(),
  salvage_value: z.number().nonnegative().optional(),
  useful_life_years: z.number().int().min(1),
  acquired_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  department_id: z.string().nullable().optional(),
});

router.post('/', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const body = createSchema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const asset = {
    id: uuid(),
    asset_code: await assetCode(),
    name: body.data.name,
    category: body.data.category || null,
    cost: body.data.cost,
    salvage_value: body.data.salvage_value ?? 0,
    useful_life_years: body.data.useful_life_years,
    depreciation_method: 'STRAIGHT_LINE',
    acquired_date: body.data.acquired_date,
    status: 'ACTIVE',
    department_id: body.data.department_id || null,
    accumulated_depreciation: 0,
    last_depreciation_date: null,
    created_at: nowIso(),
  };
  await db.insert('fixed_assets', asset);
  await auditLog({ user: req.user, action: 'CREATE_ASSET', entity: 'fixed_asset', entityId: asset.id, newValue: asset });
  ok(res, asset);
}));

router.post('/:id/depreciate', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const db = getDb();
  const asset = await db.selectOne('fixed_assets', { where: { id: req.params.id } });
  if (!asset) return fail(res, 404, 'Asset not found');
  if (asset.status !== 'ACTIVE') return fail(res, 400, 'Only active assets can be depreciated');
  const periodEnd = (req.query.asOf as string) || isoDate(new Date());
  const last = asset.last_depreciation_date ? dayjs(asset.last_depreciation_date) : dayjs(asset.acquired_date);
  const next = last.add(1, 'month');
  if (dayjs(periodEnd) < next) {
    return fail(res, 400, `Depreciation cannot run before ${next.format('YYYY-MM-DD')}`);
  }
  const monthly = Math.round(((asset.cost - asset.salvage_value) / asset.useful_life_years / 12) * 100) / 100;
  const months = dayjs(periodEnd).diff(last, 'month');
  const amount = Math.round(monthly * months * 100) / 100;
  const maxDep = asset.cost - asset.salvage_value;
  const newAccum = Math.min(asset.accumulated_depreciation + amount, maxDep);
  const actualAmount = Math.round((newAccum - asset.accumulated_depreciation) * 100) / 100;
  if (actualAmount <= 0) return fail(res, 400, 'Asset is fully depreciated');

  const depExp = await getSystemAccount(CONTROL_ACCOUNTS.DEPRECIATION_EXPENSE);
  const accum = await getSystemAccount('1490');
  if (!depExp || !accum) return fail(res, 500, 'Depreciation GL accounts not configured');
  await postLinesToLedger(db, req.user, periodEnd, `Depreciation - ${asset.asset_code} ${asset.name}`, [
    { account_id: depExp.id, description: `Depreciation ${asset.name}`, debit: actualAmount },
    { account_id: accum.id, description: `Accumulated depreciation ${asset.name}`, credit: actualAmount },
  ], { approve: true });
  const updated = await db.update('fixed_assets', { id: asset.id }, {
    accumulated_depreciation: newAccum,
    last_depreciation_date: periodEnd,
  });
  await auditLog({ user: req.user, action: 'DEPRECIATE_ASSET', entity: 'fixed_asset', entityId: asset.id, newValue: { amount: actualAmount } });
  ok(res, { ...(updated || asset), monthly, amount: actualAmount, months });
}));

router.put('/:id/status', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const body = z.object({ status: z.enum(['ACTIVE', 'DISPOSED', 'SOLD']) }).safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const asset = await db.selectOne('fixed_assets', { where: { id: req.params.id } });
  if (!asset) return fail(res, 404, 'Asset not found');
  const updated = await db.update('fixed_assets', { id: asset.id }, { status: body.data.status });
  await auditLog({ user: req.user, action: 'UPDATE_ASSET_STATUS', entity: 'fixed_asset', entityId: asset.id, newValue: { status: body.data.status } });
  ok(res, updated);
}));

export default router;
