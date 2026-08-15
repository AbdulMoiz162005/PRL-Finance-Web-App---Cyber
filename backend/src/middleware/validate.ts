import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const details = (parsed.error as ZodError).issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return res.status(422).json({ success: false, error: 'Validation failed', details });
    }
    req.body = parsed.data;
    next();
  };
}

export function notFound(_req: Request, res: Response) {
  return res.status(404).json({ success: false, error: 'Route not found' });
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error('[API ERROR]', err);
  const message = err?.message || 'Internal server error';
  const status = err?.status || (message.includes('unique') ? 409 : 500);
  return res.status(status).json({ success: false, error: message });
}
