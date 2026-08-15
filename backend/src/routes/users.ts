import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { canManageUsers, requireMinRole } from '../middleware/rbac';
import { asyncHandler, ok, fail, pick } from '../utils/http';
import { uuid, nowIso } from '../utils/id';
import { auditLog } from '../services/audit';

const router = Router();
router.use(authMiddleware);

const ROLES = ['SUPER_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_MANAGER', 'ACCOUNTANT', 'CASHIER', 'AUDITOR', 'VIEWER'];

router.get('/', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const db = getDb();
  const users = await db.select('users');
  const depts = await db.select('departments');
  const deptMap = new Map<string, any>(depts.map((d) => [d.id, d]));
  ok(res, users.map((u) => ({
    ...u,
    password_hash: undefined,
    department: u.department_id ? { id: u.department_id, name: deptMap.get(u.department_id)?.name } : null,
  })));
}));

const createSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2),
  role: z.enum(ROLES as any),
  department_id: z.string().nullable().optional(),
  password: z.string().min(8),
});

router.post('/', canManageUsers, asyncHandler(async (req, res) => {
  const body = createSchema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const data = body.data;
  const existing = await db.selectOne('users', { where: { email: data.email.toLowerCase().trim() } });
  if (existing) return fail(res, 409, 'A user with this email already exists');
  const user = {
    id: uuid(),
    email: data.email.toLowerCase().trim(),
    password_hash: bcrypt.hashSync(data.password, 10),
    full_name: data.full_name,
    role: data.role,
    department_id: data.department_id || null,
    status: 'ACTIVE',
    last_login_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await db.insert('users', user);
  await auditLog({ user: req.user, action: 'CREATE_USER', entity: 'user', entityId: user.id, newValue: pick(user, ['email', 'full_name', 'role']) });
  ok(res, { ...user, password_hash: undefined });
}));

const updateSchema = z.object({
  full_name: z.string().min(2).optional(),
  role: z.enum(ROLES as any).optional(),
  department_id: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  password: z.string().min(8).optional(),
});

router.put('/:id', canManageUsers, asyncHandler(async (req, res) => {
  const body = updateSchema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const user = await db.selectOne('users', { where: { id: req.params.id } });
  if (!user) return fail(res, 404, 'User not found');
  if (user.id === req.user.id && body.data.status === 'DISABLED') {
    return fail(res, 400, 'You cannot disable your own account');
  }
  const changes: any = { ...pick(body.data, ['full_name', 'role', 'department_id', 'status']), updated_at: nowIso() };
  if (body.data.password) changes.password_hash = bcrypt.hashSync(body.data.password, 10);
  const updated = await db.update('users', { id: user.id }, changes);
  await auditLog({ user: req.user, action: 'UPDATE_USER', entity: 'user', entityId: user.id, oldValue: pick(user, ['full_name', 'role', 'status']), newValue: pick(changes, ['full_name', 'role', 'status']) });
  ok(res, { ...updated, password_hash: undefined });
}));

router.delete('/:id', canManageUsers, asyncHandler(async (req, res) => {
  const db = getDb();
  const user = await db.selectOne('users', { where: { id: req.params.id } });
  if (!user) return fail(res, 404, 'User not found');
  if (user.id === req.user.id) return fail(res, 400, 'You cannot delete your own account');
  await db.update('users', { id: user.id }, { status: 'DISABLED', updated_at: nowIso() });
  await auditLog({ user: req.user, action: 'DISABLE_USER', entity: 'user', entityId: user.id });
  ok(res, { message: 'User disabled' });
}));

export default router;
