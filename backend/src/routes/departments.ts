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

router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const depts = await db.select('departments', { order: { column: 'code' } });
  const heads = await db.select('users', { where: { status: 'ACTIVE' } });
  const headMap = new Map<string, string>(heads.map((h) => [h.id, h.full_name]));
  ok(res, depts.map((d) => ({ ...d, head: d.head_user_id ? headMap.get(d.head_user_id) : null })));
}));

const schema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(2),
  description: z.string().nullable().optional(),
  head_user_id: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

router.post('/', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const body = schema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const existing = await db.selectOne('departments', { where: { code: body.data.code.toUpperCase() } });
  if (existing) return fail(res, 409, 'Department code already exists');
  const dept = { ...body.data, code: body.data.code.toUpperCase(), id: uuid(), head_user_id: body.data.head_user_id || null, is_active: body.data.is_active ?? true, created_at: nowIso() };
  await db.insert('departments', dept);
  await auditLog({ user: req.user, action: 'CREATE_DEPARTMENT', entity: 'department', entityId: dept.id, newValue: dept });
  ok(res, dept);
}));

router.put('/:id', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const body = schema.partial().safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const dept = await db.selectOne('departments', { where: { id: req.params.id } });
  if (!dept) return fail(res, 404, 'Department not found');
  const updated = await db.update('departments', { id: dept.id }, pick(body.data, ['name', 'description', 'head_user_id', 'is_active']));
  await auditLog({ user: req.user, action: 'UPDATE_DEPARTMENT', entity: 'department', entityId: dept.id, newValue: updated });
  ok(res, updated);
}));

export default router;
