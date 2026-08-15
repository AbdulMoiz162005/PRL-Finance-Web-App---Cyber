import { getDb } from '../db';
import { uuid, nowIso } from '../utils/id';

export async function notifyUser(userId: string, title: string, message: string, type = 'INFO') {
  try {
    await getDb().insert('notifications', {
      id: uuid(),
      user_id: userId,
      type,
      title,
      message: message || null,
      is_read: false,
      created_at: nowIso(),
    });
  } catch (e) {
    console.error('notify failed', e);
  }
}

export async function notifyAdmins(title: string, message: string, type = 'INFO') {
  try {
    const admins = await getDb().select('users', {
      where: { status: 'ACTIVE' },
    });
    const targets = admins.filter((u) =>
      ['SUPER_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_MANAGER'].includes(u.role)
    );
    for (const u of targets) {
      await notifyUser(u.id, title, message, type);
    }
  } catch (e) {
    console.error('notify admins failed', e);
  }
}
