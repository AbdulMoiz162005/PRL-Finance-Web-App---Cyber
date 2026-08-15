import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireMinRole } from '../middleware/rbac';
import { asyncHandler, ok, fail, pick } from '../utils/http';
import { uuid, nowIso } from '../utils/id';
import { customerCode } from '../services/sequence';
import { auditLog } from '../services/audit';

const router = Router();
router.use(authMiddleware);

async function decorate(db: any, rows: any[]) {
  const currencies = await db.select('currencies');
  const curMap = new Map<string, any>(currencies.map((c: any) => [c.id, c]));
  const invoices = await db.select('invoices', { where: { kind: 'AR' } });
  const byCustomer = new Map<string, number>();
  for (const inv of invoices) {
    const out = (inv.total || 0) - (inv.amount_paid || 0);
    if (out > 0 && !['DRAFT', 'SUBMITTED', 'CANCELLED'].includes(inv.status)) {
      byCustomer.set(inv.customer_id, (byCustomer.get(inv.customer_id) || 0) + out);
    }
  }
  return rows.map((c) => ({ ...c, currency: c.currency_id ? curMap.get(c.currency_id) || null : null, outstanding: Math.round(byCustomer.get(c.id) || 0) }));
}

router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const customers = await db.select('customers', { order: { column: 'name' } });
  ok(res, await decorate(db, customers));
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
  credit_limit: z.number().nonnegative().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

router.post('/', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const body = schema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const customer = {
    id: uuid(),
    code: body.data.code || (await customerCode()),
    name: body.data.name,
    tin: body.data.tin || null,
    contact_person: body.data.contact_person || null,
    email: body.data.email || null,
    phone: body.data.phone || null,
    address: body.data.address || null,
    payment_terms_days: body.data.payment_terms_days ?? 30,
    currency_id: body.data.currency_id || null,
    credit_limit: body.data.credit_limit ?? null,
    status: body.data.status || 'ACTIVE',
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await db.insert('customers', customer);
  await auditLog({ user: req.user, action: 'CREATE_CUSTOMER', entity: 'customer', entityId: customer.id, newValue: customer });
  ok(res, customer);
}));

router.put('/:id', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const body = schema.partial().safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const customer = await db.selectOne('customers', { where: { id: req.params.id } });
  if (!customer) return fail(res, 404, 'Customer not found');
  const updated = await db.update('customers', { id: customer.id }, { ...pick(body.data, ['name', 'tin', 'contact_person', 'email', 'phone', 'address', 'payment_terms_days', 'currency_id', 'credit_limit', 'status']), updated_at: nowIso() });
  await auditLog({ user: req.user, action: 'UPDATE_CUSTOMER', entity: 'customer', entityId: customer.id, newValue: updated });
  ok(res, updated);
}));

export default router;
