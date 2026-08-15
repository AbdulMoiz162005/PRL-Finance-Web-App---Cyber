import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { getDb } from './db';
import { seedIfEmpty } from './services/seed';
import { errorHandler, notFound } from './middleware/validate';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import departmentRoutes from './routes/departments';
import settingsRoutes from './routes/settings';
import accountRoutes from './routes/accounts';
import journalRoutes from './routes/journals';
import vendorRoutes from './routes/vendors';
import customerRoutes from './routes/customers';
import invoiceRoutes from './routes/invoices';
import paymentRoutes from './routes/payments';
import bankRoutes from './routes/banks';
import budgetRoutes from './routes/budgets';
import pettyCashRoutes from './routes/pettycash';
import assetRoutes from './routes/assets';
import reportRoutes from './routes/reports';
import dashboardRoutes from './routes/dashboard';
import auditRoutes from './routes/audit';
import notificationRoutes from './routes/notifications';

async function main() {
  const db = getDb();
  console.log(`[startup] database adapter: ${db.name}`);

  if (env.seedOnBoot) {
    await seedIfEmpty();
  }

  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '5mb' }));
  app.use(morgan(env.isProd ? 'combined' : 'dev'));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', db: db.name, time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/departments', departmentRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/accounts', accountRoutes);
  app.use('/api/journals', journalRoutes);
  app.use('/api/vendors', vendorRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/bank-accounts', bankRoutes);
  app.use('/api/budgets', budgetRoutes);
  app.use('/api/petty-cash', pettyCashRoutes);
  app.use('/api/assets', assetRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/audit-logs', auditRoutes);
  app.use('/api/notifications', notificationRoutes);

  app.use(notFound);
  app.use(errorHandler);

  app.listen(env.port, () => {
    console.log(`[startup] Refinery Finance API listening on port ${env.port}`);
  });
}

main().catch((e) => {
  console.error('Fatal startup error:', e);
  process.exit(1);
});
