import { getDb } from '../db';
import { nowIso } from '../utils/id';

export interface AuditInput {
  user?: any;
  action: string;
  entity: string;
  entityId?: string;
  oldValue?: any;
  newValue?: any;
  ip?: string;
  userAgent?: string;
}

export async function auditLog(input: AuditInput) {
  try {
    await getDb().insert('audit_logs', {
      user_id: input.user?.id || null,
      email: input.user?.email || null,
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId ? String(input.entityId) : null,
      old_value: input.oldValue !== undefined ? JSON.stringify(input.oldValue) : null,
      new_value: input.newValue !== undefined ? JSON.stringify(input.newValue) : null,
      ip_address: input.ip || null,
      user_agent: input.userAgent || null,
      created_at: nowIso(),
    });
  } catch (e) {
    console.error('audit log failed', e);
  }
}
