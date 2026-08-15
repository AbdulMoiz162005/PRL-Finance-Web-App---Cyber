import { Request, Response, NextFunction } from 'express';

export const ROLE_HIERARCHY: Record<string, number> = {
  VIEWER: 0,
  AUDITOR: 1,
  CASHIER: 2,
  ACCOUNTANT: 3,
  FINANCE_MANAGER: 4,
  FINANCE_DIRECTOR: 5,
  SUPER_ADMIN: 6,
};

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (roles.includes(role) || role === 'SUPER_ADMIN') return next();
    return res.status(403).json({ success: false, error: `Requires role: ${roles.join(' or ')}` });
  };
}

export function requireMinRole(minRole: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const level = ROLE_HIERARCHY[role] ?? -1;
    const required = ROLE_HIERARCHY[minRole] ?? 0;
    if (level >= required) return next();
    return res.status(403).json({ success: false, error: `Requires role at least ${minRole}` });
  };
}

export function canManageUsers(req: Request, res: Response, next: NextFunction) {
  const role = req.user?.role;
  if (role === 'SUPER_ADMIN' || role === 'FINANCE_DIRECTOR' || role === 'FINANCE_MANAGER') {
    return next();
  }
  return res.status(403).json({ success: false, error: 'Not authorized to manage users' });
}
