import { Request, Response, NextFunction } from 'express';

export function ok(res: Response, data: any = null, meta: any = undefined) {
  return res.json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function fail(res: Response, status: number, message: string, details?: any) {
  return res.status(status).json({ success: false, error: message, ...(details ? { details } : {}) });
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function parseNum(v: any, def = 0): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
}

export function parseBool(v: any, def = false): boolean {
  if (v === undefined || v === null) return def;
  return [true, 'true', '1', 'yes'].includes(v);
}

export function pick(obj: Record<string, any>, keys: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

export async function csv(res: Response, filename: string, headers: string[], rows: any[][]) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) lines.push(r.map(esc).join(','));
  res.send('\uFEFF' + lines.join('\n'));
}
