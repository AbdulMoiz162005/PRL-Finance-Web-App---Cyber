import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireMinRole } from '../middleware/rbac';
import { asyncHandler, ok, fail, pick } from '../utils/http';
import { uuid, nowIso } from '../utils/id';
import { vendorCode } from '../services/sequence';
import { auditLog } from '../services/audit';

const router = Router();
router.use(authMiddleware);

async function decorate(db: any, rows: any[]) {
  const currencies = await db.select('currencies');
  const curMap = new Map<string, any>(currencies.map((c: any) => [c.id, c]));
  const invoices = await db.select('invoices', { where: { kind: 'AP' } });
  const byVendor = new Map<string, number>();
  for (const inv of invoices) {
    const out = (inv.total || 0) - (inv.amount_paid || 0);
    if (out > 0 && !['DRAFT', 'SUBMITTED', 'CANCELLED'].includes(inv.status)) {
      byVendor.set(inv.vendor_id, (byVendor.get(inv.vendor_id) || 0) + out);
    }
  }
  return rows.map((v) => ({ ...v, currency: v.currency_id ? curMap.get(v.currency_id) || null : null, outstanding: Math.round(byVendor.get(v.id) || 0) }));
}

router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const vendors = await db.select('vendors', { order: { column: 'name' } });
  ok(res, await decorate(db, vendors));
}));

const schema = z.object({
  code: z.string().optional(),
  name: z.string().min(2),
  tin: z.string().nullable().optional(),
  contact_person: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  payment_terms_days: z.number().int().min(0).optional(),
  currency_id: z.string().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  bank_account: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

router.post('/', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const body = schema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const vendor = {
    id: uuid(),
    code: body.data.code || (await vendorCode()),
    name: body.data.name,
    tin: body.data.tin || null,
    contact_person: body.data.contact_person || null,
    email: body.data.email || null,
    phone: body.data.phone || null,
    address: body.data.address || null,
    payment_terms_days: body.data.payment_terms_days ?? 30,
    currency_id: body.data.currency_id || null,
    bank_name: body.data.bank_name || null,
    bank_account: body.data.bank_account || null,
    status: body.data.status || 'ACTIVE',
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await db.insert('vendors', vendor);
  await auditLog({ user: req.user, action: 'CREATE_VENDOR', entity: 'vendor', entityId: vendor.id, newValue: vendor });
  ok(res, vendor);
}));

router.put('/:id', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const body = schema.partial().safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const vendor = await db.selectOne('vendors', { where: { id: req.params.id } });
  if (!vendor) return fail(res, 404, 'Vendor not found');
  const updated = await db.update('vendors', { id: vendor.id }, { ...pick(body.data, ['name', 'tin', 'contact_person', 'email', 'phone', 'address', 'payment_terms_days', 'currency_id', 'bank_name', 'bank_account', 'status']), updated_at: nowIso() });
  await auditLog({ user: req.user, action: 'UPDATE_VENDOR', entity: 'vendor', entityId: vendor.id, newValue: updated });
  ok(res, updated);
}));

export default router;
