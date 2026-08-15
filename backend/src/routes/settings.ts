import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireMinRole } from '../middleware/rbac';
import { asyncHandler, ok, fail, pick } from '../utils/http';
import { uuid, nowIso } from '../utils/id';
import { auditLog } from '../services/audit';

const router = Router();
router.use(authMiddleware);

router.get('/currencies', asyncHandler(async (req, res) => {
  const db = getDb();
  const currencies = await db.select('currencies', { order: { column: 'code' } });
  ok(res, currencies);
}));

router.put('/currencies/:id', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const body = z.object({ rate_to_base: z.number().positive(), is_active: z.boolean().optional() }).safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const cur = await db.selectOne('currencies', { where: { id: req.params.id } });
  if (!cur) return fail(res, 404, 'Currency not found');
  if (cur.is_base) return fail(res, 400, 'Base currency rate cannot be changed');
  const updated = await db.update('currencies', { id: cur.id }, pick(body.data, ['rate_to_base', 'is_active']));
  await auditLog({ user: req.user, action: 'UPDATE_CURRENCY', entity: 'currency', entityId: cur.id, newValue: updated });
  ok(res, updated);
}));

router.get('/tax-rates', asyncHandler(async (req, res) => {
  const db = getDb();
  ok(res, await db.select('tax_rates', { order: { column: 'name' } }));
}));

const taxSchema = z.object({ name: z.string().min(1), rate: z.number().min(0).max(100), is_active: z.boolean().optional() });

router.post('/tax-rates', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const body = taxSchema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const rate = { id: uuid(), name: body.data.name, rate: body.data.rate, is_active: body.data.is_active ?? true };
  await db.insert('tax_rates', rate);
  await auditLog({ user: req.user, action: 'CREATE_TAX_RATE', entity: 'tax_rate', entityId: rate.id });
  ok(res, rate);
}));

router.get('/company', asyncHandler(async (req, res) => {
  const db = getDb();
  let settings = await db.selectOne('company_settings');
  if (!settings) {
    const usd = await db.selectOne('currencies', { where: { is_base: true } });
    settings = await db.insert('company_settings', {
      id: uuid(),
      company_name: 'Refinery Terminal',
      legal_name: null,
      tax_id: null,
      address: null,
      phone: null,
      email: null,
      website: null,
      base_currency_id: usd?.id || null,
      fiscal_year_start: 1,
      default_tax_rate_id: null,
      updated_at: nowIso(),
    });
  }
  const base = settings.base_currency_id ? await db.selectOne('currencies', { where: { id: settings.base_currency_id } }) : null;
  ok(res, { ...settings, base_currency: base });
}));

const companySchema = z.object({
  company_name: z.string().min(1),
  legal_name: z.string().nullable().optional(),
  tax_id: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  base_currency_id: z.string().nullable().optional(),
  fiscal_year_start: z.number().min(1).max(12).optional(),
  default_tax_rate_id: z.string().nullable().optional(),
});

router.put('/company', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const body = companySchema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const settings = await db.selectOne('company_settings');
  const data = pick(body.data, ['company_name', 'legal_name', 'tax_id', 'address', 'phone', 'email', 'website', 'base_currency_id', 'fiscal_year_start', 'default_tax_rate_id']);
  let updated;
  if (settings) {
    updated = await db.update('company_settings', { id: settings.id }, { ...data, updated_at: nowIso() });
  } else {
    updated = await db.insert('company_settings', { id: uuid(), ...data, updated_at: nowIso() });
  }
  await auditLog({ user: req.user, action: 'UPDATE_COMPANY_SETTINGS', entity: 'company_settings', entityId: (updated as any)?.id, newValue: updated });
  ok(res, updated);
}));

export default router;
