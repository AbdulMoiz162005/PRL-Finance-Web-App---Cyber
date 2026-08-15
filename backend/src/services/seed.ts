import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import { getDb } from '../db';
import { uuid, nowIso, isoDate } from '../utils/id';
import { getSystemAccount, postLinesToLedger, CONTROL_ACCOUNTS } from './ledger';
import { createInvoiceEntry } from '../services/invoiceops';

const PASS = 'Refinery@2024';

const DEPARTMENTS = [
  { code: 'OPS', name: 'Operations' },
  { code: 'MNT', name: 'Maintenance & Engineering' },
  { code: 'LOG', name: 'Logistics & Marine' },
  { code: 'HSE', name: 'Health Safety & Environment' },
  { code: 'ADM', name: 'Administration' },
  { code: 'FIN', name: 'Finance & Accounts' },
  { code: 'SAL', name: 'Sales & Marketing' },
  { code: 'PRO', name: 'Procurement' },
];

const USERS = [
  { email: 'admin@refinery.local', full_name: 'System Administrator', role: 'SUPER_ADMIN', dept: 'FIN' },
  { email: 'director@refinery.local', full_name: 'Mariam Diallo', role: 'FINANCE_DIRECTOR', dept: 'FIN' },
  { email: 'manager@refinery.local', full_name: 'Daniel Okafor', role: 'FINANCE_MANAGER', dept: 'FIN' },
  { email: 'accountant@refinery.local', full_name: 'Grace Adeyemi', role: 'ACCOUNTANT', dept: 'FIN' },
  { email: 'cashier@refinery.local', full_name: 'Samuel Boateng', role: 'CASHIER', dept: 'FIN' },
  { email: 'auditor@refinery.local', full_name: 'Internal Audit Unit', role: 'AUDITOR', dept: 'ADM' },
  { email: 'viewer@refinery.local', full_name: 'Board Observer', role: 'VIEWER', dept: 'ADM' },
];

const COA: [string, string, string, string, string][] = [
  // [code, name, type, normal, category]
  ['1000', 'Cash & Cash Equivalents', 'ASSET', 'DEBIT', 'Current Assets'],
  ['1010', 'Petty Cash', 'ASSET', 'DEBIT', 'Current Assets'],
  ['1020', 'Operating Bank Account (USD)', 'ASSET', 'DEBIT', 'Current Assets'],
  ['1021', 'Operating Bank Account (Local)', 'ASSET', 'DEBIT', 'Current Assets'],
  ['1030', 'Collections Account', 'ASSET', 'DEBIT', 'Current Assets'],
  ['1100', 'Accounts Receivable', 'ASSET', 'DEBIT', 'Current Assets'],
  ['1110', 'Trade Receivables - Customers', 'ASSET', 'DEBIT', 'Current Assets'],
  ['1200', 'Inventory', 'ASSET', 'DEBIT', 'Current Assets'],
  ['1210', 'Crude Oil Inventory', 'ASSET', 'DEBIT', 'Current Assets'],
  ['1220', 'Refined Products Inventory', 'ASSET', 'DEBIT', 'Current Assets'],
  ['1230', 'Spare Parts & Consumables', 'ASSET', 'DEBIT', 'Current Assets'],
  ['1240', 'Chemicals & Additives', 'ASSET', 'DEBIT', 'Current Assets'],
  ['1300', 'Prepayments', 'ASSET', 'DEBIT', 'Current Assets'],
  ['1400', 'Fixed Assets', 'ASSET', 'DEBIT', 'Non-Current Assets'],
  ['1410', 'Land', 'ASSET', 'DEBIT', 'Non-Current Assets'],
  ['1420', 'Buildings & Civil Works', 'ASSET', 'DEBIT', 'Non-Current Assets'],
  ['1430', 'Plant & Refinery Units', 'ASSET', 'DEBIT', 'Non-Current Assets'],
  ['1440', 'Storage Tanks & Pipelines', 'ASSET', 'DEBIT', 'Non-Current Assets'],
  ['1450', 'Vehicles', 'ASSET', 'DEBIT', 'Non-Current Assets'],
  ['1460', 'Office Equipment & Furniture', 'ASSET', 'DEBIT', 'Non-Current Assets'],
  ['1470', 'IT & Computer Equipment', 'ASSET', 'DEBIT', 'Non-Current Assets'],
  ['1480', 'Capital Work in Progress', 'ASSET', 'DEBIT', 'Non-Current Assets'],
  ['1490', 'Accumulated Depreciation', 'ASSET', 'CREDIT', 'Non-Current Assets'],
  ['1500', 'Other Assets', 'ASSET', 'DEBIT', 'Non-Current Assets'],
  ['1510', 'Deposits & Guarantees', 'ASSET', 'DEBIT', 'Non-Current Assets'],
  ['1520', 'VAT Recoverable', 'ASSET', 'DEBIT', 'Current Assets'],
  ['2000', 'Accounts Payable', 'LIABILITY', 'CREDIT', 'Current Liabilities'],
  ['2010', 'Trade Payables - Vendors', 'LIABILITY', 'CREDIT', 'Current Liabilities'],
  ['2020', 'Accrued Expenses', 'LIABILITY', 'CREDIT', 'Current Liabilities'],
  ['2100', 'Short-term Borrowings', 'LIABILITY', 'CREDIT', 'Current Liabilities'],
  ['2200', 'Other Current Liabilities', 'LIABILITY', 'CREDIT', 'Current Liabilities'],
  ['2210', 'VAT Payable', 'LIABILITY', 'CREDIT', 'Current Liabilities'],
  ['2220', 'Payroll Payable', 'LIABILITY', 'CREDIT', 'Current Liabilities'],
  ['2230', 'Withholding Tax Payable', 'LIABILITY', 'CREDIT', 'Current Liabilities'],
  ['2300', 'Long-term Loans & Leases', 'LIABILITY', 'CREDIT', 'Non-Current Liabilities'],
  ['3000', 'Equity', 'EQUITY', 'CREDIT', 'Equity'],
  ['3100', 'Share Capital', 'EQUITY', 'CREDIT', 'Equity'],
  ['3200', 'Retained Earnings', 'EQUITY', 'CREDIT', 'Equity'],
  ['4000', 'Sales Revenue', 'REVENUE', 'CREDIT', 'Operating Revenue'],
  ['4010', 'Refined Products Sales', 'REVENUE', 'CREDIT', 'Operating Revenue'],
  ['4020', 'Crude Oil Throughput Fees', 'REVENUE', 'CREDIT', 'Operating Revenue'],
  ['4030', 'Storage & Tankage Fees', 'REVENUE', 'CREDIT', 'Operating Revenue'],
  ['4040', 'Terminal Handling Fees', 'REVENUE', 'CREDIT', 'Operating Revenue'],
  ['4050', 'Blending Services', 'REVENUE', 'CREDIT', 'Operating Revenue'],
  ['4060', 'Other Operating Revenue', 'REVENUE', 'CREDIT', 'Operating Revenue'],
  ['4100', 'Other Income', 'REVENUE', 'CREDIT', 'Other Income'],
  ['4110', 'Interest Income', 'REVENUE', 'CREDIT', 'Other Income'],
  ['4120', 'Foreign Exchange Gains', 'REVENUE', 'CREDIT', 'Other Income'],
  ['4130', 'Scrap Sales', 'REVENUE', 'CREDIT', 'Other Income'],
  ['5000', 'Cost of Goods Sold', 'EXPENSE', 'DEBIT', 'Cost of Sales'],
  ['5010', 'Cost of Crude Purchases', 'EXPENSE', 'DEBIT', 'Cost of Sales'],
  ['5020', 'Blending Additives Cost', 'EXPENSE', 'DEBIT', 'Cost of Sales'],
  ['5030', 'Freight & Logistics Cost', 'EXPENSE', 'DEBIT', 'Cost of Sales'],
  ['5100', 'Operating Expenses', 'EXPENSE', 'DEBIT', 'Operating'],
  ['5110', 'Salaries & Wages', 'EXPENSE', 'DEBIT', 'Operating'],
  ['5120', 'Employee Benefits & Bonuses', 'EXPENSE', 'DEBIT', 'Operating'],
  ['5130', 'Utilities (Power, Water, Gas)', 'EXPENSE', 'DEBIT', 'Operating'],
  ['5140', 'Maintenance & Repairs', 'EXPENSE', 'DEBIT', 'Operating'],
  ['5150', 'Chemicals & Consumables', 'EXPENSE', 'DEBIT', 'Operating'],
  ['5160', 'Insurance', 'EXPENSE', 'DEBIT', 'Operating'],
  ['5170', 'Fuel & Diesel', 'EXPENSE', 'DEBIT', 'Operating'],
  ['5180', 'Security Services', 'EXPENSE', 'DEBIT', 'Operating'],
  ['5190', 'HSE & Environmental Compliance', 'EXPENSE', 'DEBIT', 'Operating'],
  ['5200', 'Administrative Expenses', 'EXPENSE', 'DEBIT', 'Administration'],
  ['5210', 'Office Rent', 'EXPENSE', 'DEBIT', 'Administration'],
  ['5220', 'Office Supplies & Stationery', 'EXPENSE', 'DEBIT', 'Administration'],
  ['5230', 'Professional & Consultancy Fees', 'EXPENSE', 'DEBIT', 'Administration'],
  ['5240', 'IT & Software Costs', 'EXPENSE', 'DEBIT', 'Administration'],
  ['5250', 'Communication', 'EXPENSE', 'DEBIT', 'Administration'],
  ['5260', 'Travel & Accommodation', 'EXPENSE', 'DEBIT', 'Administration'],
  ['5270', 'Bank Charges', 'EXPENSE', 'DEBIT', 'Administration'],
  ['5280', 'Depreciation Expense', 'EXPENSE', 'DEBIT', 'Administration'],
  ['5290', 'Training & Development', 'EXPENSE', 'DEBIT', 'Administration'],
  ['5300', 'Selling & Marketing', 'EXPENSE', 'DEBIT', 'Selling'],
  ['5310', 'Advertising & Promotion', 'EXPENSE', 'DEBIT', 'Selling'],
  ['5400', 'Finance Costs', 'EXPENSE', 'DEBIT', 'Finance'],
  ['5410', 'Interest Expense', 'EXPENSE', 'DEBIT', 'Finance'],
  ['5420', 'Foreign Exchange Losses', 'EXPENSE', 'DEBIT', 'Finance'],
  ['5500', 'Taxes', 'EXPENSE', 'DEBIT', 'Taxes'],
  ['5510', 'Property & Other Taxes', 'EXPENSE', 'DEBIT', 'Taxes'],
];

const VENDORS = [
  { code: 'VND-001', name: 'Global Crude Supply Co.', tin: 'CR-1100221', email: 'billing@globalcrude.com', terms: 30 },
  { code: 'VND-002', name: 'Atlas Maintenance & EPC', tin: 'CR-1100888', email: 'ap@atlasmep.com', terms: 45 },
  { code: 'VND-003', name: 'SafeGuard Security Services', tin: 'CR-1100333', email: 'accounts@safeguard.com', terms: 30 },
  { code: 'VND-004', name: 'PowerGrid Utilities Ltd', tin: 'CR-1100444', email: 'billing@powergrid.com', terms: 15 },
  { code: 'VND-005', name: 'ChemCore Additives', tin: 'CR-1100555', email: 'invoices@chemcore.com', terms: 30 },
  { code: 'VND-006', name: 'Meridian Marine Logistics', tin: 'CR-1100666', email: 'ap@meridianlog.com', terms: 30 },
];

const CUSTOMERS = [
  { code: 'CUS-001', name: 'Atlantic Fuels Distribution', tin: 'CR-2200111', email: 'payments@atlanticfuels.com', terms: 30 },
  { code: 'CUS-002', name: 'Skyline Aviation Services', tin: 'CR-2200222', email: 'ap@skylineaviation.com', terms: 15 },
  { code: 'CUS-003', name: 'Bluewater Marine Bunkering', tin: 'CR-2200333', email: 'finance@bluewatermarine.com', terms: 30 },
  { code: 'CUS-004', name: 'Industrial Energy Group', tin: 'CR-2200444', email: 'accounts@industrialenergy.com', terms: 45 },
  { code: 'CUS-005', name: 'Coastal Retail Depots', tin: 'CR-2200555', email: 'ap@coastalretail.com', terms: 30 },
];

async function seedCurrenciesAndSettings() {
  const db = getDb();
  const existing = await db.count('currencies');
  if (existing === 0) {
    await db.insert('currencies', [
      { id: uuid(), code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2, rate_to_base: 1, is_base: true, is_active: true },
      { id: uuid(), code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2, rate_to_base: 1.09, is_base: false, is_active: true },
      { id: uuid(), code: 'NGN', name: 'Nigerian Naira', symbol: '₦', decimal_places: 2, rate_to_base: 0.00062, is_base: false, is_active: true },
      { id: uuid(), code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵', decimal_places: 2, rate_to_base: 0.073, is_base: false, is_active: true },
    ]);
  }
  if ((await db.count('company_settings')) === 0) {
    const usd = await db.selectOne('currencies', { where: { code: 'USD' } });
    const vat = await db.selectOne('tax_rates', { where: { name: 'VAT 16%' } });
    await db.insert('company_settings', {
      id: uuid(),
      company_name: 'Refinery Terminal Finance',
      legal_name: 'Gulf Coast Refinery & Terminal Company Ltd',
      tax_id: 'RT-9900123',
      address: 'Terminal Road, Industrial Free Zone, 5001 Port City',
      phone: '+233 302 555 0123',
      email: 'finance@refinery-terminal.com',
      website: 'https://refinery-terminal.com',
      base_currency_id: usd?.id || null,
      fiscal_year_start: 1,
      default_tax_rate_id: vat?.id || null,
      updated_at: nowIso(),
    });
  }
}

export async function runSeed() {
  const db = getDb();
  const existing = await db.count('users');
  if (existing > 0) {
    console.log('[seed] users exist, skipping seed');
    return false;
  }
  console.log('[seed] seeding database...');

  if ((await db.count('departments')) === 0) {
    await db.insert('departments', DEPARTMENTS.map((d) => ({
      id: uuid(), code: d.code, name: d.name, description: null, head_user_id: null, is_active: true, created_at: nowIso(),
    })));
  }

  await seedCurrenciesAndSettings();

  if ((await db.count('tax_rates')) === 0) {
    await db.insert('tax_rates', [
      { id: uuid(), name: 'VAT 16%', rate: 16, is_active: true },
      { id: uuid(), name: 'Zero Rated', rate: 0, is_active: true },
      { id: uuid(), name: 'WHT 5% (Contracts)', rate: 5, is_active: true },
    ]);
  }

  const coaIds = new Map<string, string>();
  if ((await db.count('chart_of_accounts')) === 0) {
    for (const [code, name, type, normal, category] of COA) {
      const id = uuid();
      coaIds.set(code, id);
      await db.insert('chart_of_accounts', {
        id, code, name, type, normal_balance: normal, category,
        parent_id: null, currency_id: null, is_active: true, is_system: false,
        description: null, created_at: nowIso(), updated_at: nowIso(),
      });
    }
  } else {
    const all = await db.select('chart_of_accounts');
    for (const a of all) coaIds.set(a.code, a.id);
  }

  const depts = await db.select('departments');
  const deptMap = new Map<string, string>(depts.map((d: any) => [d.code, d.id]));
  const hash = bcrypt.hashSync(PASS, 10);
  const userIds = new Map<string, string>();
  for (const u of USERS) {
    const id = uuid();
    userIds.set(u.email, id);
    await db.insert('users', {
      id, email: u.email, password_hash: hash, full_name: u.full_name, role: u.role,
      department_id: deptMap.get(u.dept) || null, status: 'ACTIVE', last_login_at: null,
      created_at: nowIso(), updated_at: nowIso(),
    });
  }
  const director = userIds.get('director@refinery.local');
  for (const d of depts) {
    if (d.code === 'FIN') await db.update('departments', { id: d.id }, { head_user_id: director });
  }

  if ((await db.count('bank_accounts')) === 0) {
    await db.insert('bank_accounts', [
      { id: uuid(), name: 'USD Operating Account', bank_name: 'Global Merchant Bank', account_number: '4302 8811 5520', currency_id: null, gl_account_id: coaIds.get('1020') || null, opening_balance: 0, is_active: true },
      { id: uuid(), name: 'Local Operations Account', bank_name: 'Coastal Commercial Bank', account_number: '1120 4477 9911', currency_id: null, gl_account_id: coaIds.get('1021') || null, opening_balance: 0, is_active: true },
      { id: uuid(), name: 'Collections Account', bank_name: 'Global Merchant Bank', account_number: '4302 8822 5533', currency_id: null, gl_account_id: coaIds.get('1030') || null, opening_balance: 0, is_active: true },
    ]);
  }

  if ((await db.count('vendors')) === 0) {
    const usd = await db.selectOne('currencies', { where: { code: 'USD' } });
    await db.insert('vendors', VENDORS.map((v) => ({
      id: uuid(),
      code: v.code,
      name: v.name,
      tin: v.tin,
      email: v.email,
      payment_terms_days: v.terms,
      contact_person: null, phone: null, address: null,
      currency_id: usd?.id || null, bank_name: null, bank_account: null,
      status: 'ACTIVE', created_at: nowIso(), updated_at: nowIso(),
    })));
  }

  if ((await db.count('customers')) === 0) {
    const usd = await db.selectOne('currencies', { where: { code: 'USD' } });
    await db.insert('customers', CUSTOMERS.map((c) => ({
      id: uuid(),
      code: c.code,
      name: c.name,
      tin: c.tin,
      email: c.email,
      payment_terms_days: c.terms,
      contact_person: null, phone: null, address: null,
      currency_id: usd?.id || null, credit_limit: 2500000, status: 'ACTIVE',
      created_at: nowIso(), updated_at: nowIso(),
    })));
  }

  await seedSampleTransactions(coaIds, deptMap, userIds);
  console.log('[seed] seeding complete');
  return true;
}

async function seedSampleTransactions(
  coaIds: Map<string, string>,
  deptMap: Map<string, string>,
  userIds: Map<string, string>
) {
  const db = getDb();
  if ((await db.count('journal_entries')) > 0) return;
  const accountant = userIds.get('accountant@refinery.local');
  const now = dayjs();
  const year = now.year();
  const mo = now.month();

  const acct = (code: string) => coaIds.get(code)!;

  await postLinesToLedger(db, { id: accountant, email: 'accountant@refinery.local' }, `${year}-01-01`,
    `Opening balances ${year}`, [
      { account_id: acct('1020'), description: 'Opening cash - USD operating', debit: 1850000 },
      { account_id: acct('1210'), description: 'Opening crude inventory', debit: 3200000 },
      { account_id: acct('1230'), description: 'Opening spares inventory', debit: 450000 },
      { account_id: acct('3100'), description: 'Share capital', credit: 5000000 },
      { account_id: acct('3200'), description: 'Prior year retained earnings', credit: 500000 },
    ], { approve: true });

  const revenueByMonth = [420000, 395000, 480000, 510000, 465000, 540000, 505000, 560000, 0, 0, 0, 0];
  const expenseByMonth = [210000, 198000, 245000, 232000, 265000, 258000, 244000, 276000, 0, 0, 0, 0];

  for (let m = 1; m <= Math.min(8, mo + 1); m++) {
    const rev = revenueByMonth[m - 1] || 0;
    const exp = expenseByMonth[m - 1] || 0;
    const date = dayjs(`${year}-${String(m).padStart(2, '0')}-15`);
    if (rev > 0) {
      await postLinesToLedger(db, { id: accountant, email: 'accountant@refinery.local' }, date.format('YYYY-MM-DD'),
        `Terminal throughput & handling fees - ${date.format('MMM YYYY')}`, [
          { account_id: acct('1110'), department_id: deptMap.get('SAL'), description: 'Trade receivables', debit: rev },
          { account_id: acct('4020'), department_id: deptMap.get('SAL'), description: 'Throughput fees', credit: rev },
        ], { approve: true });
    }
    if (exp > 0) {
      await postLinesToLedger(db, { id: accountant, email: 'accountant@refinery.local' }, date.format('YYYY-MM-DD'),
        `Operating costs - ${date.format('MMM YYYY')}`, [
          { account_id: acct('5140'), department_id: deptMap.get('MNT'), description: 'Maintenance & repairs', debit: exp * 0.45 },
          { account_id: acct('5110'), department_id: deptMap.get('OPS'), description: 'Salaries & wages', debit: exp * 0.4 },
          { account_id: acct('5130'), department_id: deptMap.get('OPS'), description: 'Utilities', debit: exp * 0.15 },
          { account_id: acct('1020'), description: 'Cash - operating', credit: exp },
        ], { approve: true });
    }
  }

  const vat = await db.selectOne('tax_rates', { where: { name: 'VAT 16%' } });
  const cust = await db.selectOne('customers', { where: { code: 'CUS-001' } });
  if (cust && vat) {
    const inv = await createInvoiceEntry(db, { id: accountant, email: 'accountant@refinery.local' }, {
      kind: 'AR',
      customer_id: cust.id,
      invoice_date: dayjs().subtract(25, 'day').format('YYYY-MM-DD'),
      due_date: dayjs().add(5, 'day').format('YYYY-MM-DD'),
      notes: 'Storage and handling services - monthly invoice',
      lines: [
        { description: 'Storage & tankage (50,000 m³)', quantity: 50000, unit_price: 1.2, account_id: acct('4030'), tax_rate_id: vat.id },
        { description: 'Terminal handling fees', quantity: 220, unit_price: 350, account_id: acct('4040'), tax_rate_id: vat.id },
      ],
    }, { autoPost: true, approvedBy: accountant });
    const usdBank = await db.selectOne('bank_accounts', { where: { name: 'USD Operating Account' } });
    if (usdBank) {
      await recordPaymentSample(db, {
        kind: 'CUSTOMER_RECEIPT', customer_id: cust.id, invoice_id: inv.id, amount: inv.total * 0.6,
        payment_date: dayjs().subtract(10, 'day').format('YYYY-MM-DD'), method: 'BANK_TRANSFER', bank_account_id: usdBank.id,
        reference: 'SWIFT-8842', created_by: accountant,
      });
    }
  }

  const vendor = await db.selectOne('vendors', { where: { code: 'VND-002' } });
  if (vendor && vat) {
    const inv = await createInvoiceEntry(db, { id: accountant, email: 'accountant@refinery.local' }, {
      kind: 'AP',
      vendor_id: vendor.id,
      invoice_date: dayjs().subtract(35, 'day').format('YYYY-MM-DD'),
      due_date: dayjs().add(10, 'day').format('YYYY-MM-DD'),
      notes: 'Routine maintenance of pump station B',
      lines: [
        { description: 'Mechanical maintenance works', quantity: 1, unit_price: 142000, account_id: acct('5140'), tax_rate_id: vat.id },
      ],
    }, { autoPost: true, approvedBy: accountant });
    const localBank = await db.selectOne('bank_accounts', { where: { name: 'Local Operations Account' } });
    if (localBank) {
      await recordPaymentSample(db, {
        kind: 'VENDOR_PAYMENT', vendor_id: vendor.id, invoice_id: inv.id, amount: inv.total * 0.5,
        payment_date: dayjs().subtract(5, 'day').format('YYYY-MM-DD'), method: 'BANK_TRANSFER', bank_account_id: localBank.id,
        reference: 'RTF-TT-9912', created_by: accountant,
      });
    }
  }

  const ops = await db.selectOne('departments', { where: { code: 'OPS' } });
  const dep = await db.selectOne('chart_of_accounts', { where: { code: '5280' } });
  const plant = await db.selectOne('chart_of_accounts', { where: { code: '1430' } });
  if (ops && dep && plant) {
    await db.insert('fixed_assets', [
      { id: uuid(), asset_code: 'AST-001', name: 'Refinery Unit 3 - Distillation Column', category: 'Plant & Machinery', cost: 4200000, salvage_value: 200000, useful_life_years: 20, depreciation_method: 'STRAIGHT_LINE', acquired_date: `${year - 3}-06-01`, status: 'ACTIVE', department_id: ops.id, accumulated_depreciation: 300000, last_depreciation_date: dayjs().subtract(1, 'month').format('YYYY-MM-DD'), created_at: nowIso() },
      { id: uuid(), asset_code: 'AST-002', name: 'Storage Tank T-07 (20,000 m³)', category: 'Storage Tanks', cost: 1800000, salvage_value: 100000, useful_life_years: 15, depreciation_method: 'STRAIGHT_LINE', acquired_date: `${year - 1}-03-15`, status: 'ACTIVE', department_id: ops.id, accumulated_depreciation: 48000, last_depreciation_date: dayjs().subtract(1, 'month').format('YYYY-MM-DD'), created_at: nowIso() },
      { id: uuid(), asset_code: 'AST-003', name: 'Firefighting System Overhaul', category: 'Plant & Machinery', cost: 650000, salvage_value: 50000, useful_life_years: 10, depreciation_method: 'STRAIGHT_LINE', acquired_date: `${year}-01-10`, status: 'ACTIVE', department_id: deptMap.get('HSE'), accumulated_depreciation: 15000, last_depreciation_date: dayjs().subtract(1, 'month').format('YYYY-MM-DD'), created_at: nowIso() },
    ]);
  }

  const finDept = deptMap.get('FIN');
  const budgets = [
    ['Annual Operating Budget', year, 'OPS', { 5110: 960000, 5130: 380000, 5140: 520000, 5170: 180000 }],
    ['Maintenance Budget', year, 'MNT', { 5140: 700000, 5150: 240000 }],
    ['Administration Budget', year, 'ADM', { 5210: 150000, 5230: 90000, 5260: 70000 }],
  ] as [string, number, string, Record<string, number>][];
  for (const [name, fy, deptCode, lines] of budgets) {
    const deptId = deptMap.get(deptCode);
    if (!deptId) continue;
    const budgetId = uuid();
    await db.insert('budgets', { id: budgetId, name, fiscal_year: fy, department_id: deptId, status: 'APPROVED', created_by: accountant, created_at: nowIso() });
    for (const [code, amount] of Object.entries(lines)) {
      const accountId = acct(code);
      const monthly = amount / 12;
      for (let m = 1; m <= 12; m++) {
        await db.insert('budget_lines', { id: uuid(), budget_id: budgetId, account_id: accountId, month: m, amount: Math.round(monthly) });
      }
    }
  }

  if ((await db.count('petty_cash_funds')) === 0) {
    const usdBank = await db.selectOne('bank_accounts', { where: { name: 'USD Operating Account' } });
    const cashier = userIds.get('cashier@refinery.local');
    const fundId = uuid();
    await db.insert('petty_cash_funds', {
      id: fundId, name: 'Terminal Office Petty Cash', fund_code: 'PC-001', custodian_id: cashier,
      bank_account_id: usdBank?.id || null, opening_balance: 5000, current_balance: 3850, is_active: true,
    });
    await db.insert('petty_cash_transactions', [
      { id: uuid(), fund_id: fundId, tx_date: dayjs().subtract(3, 'day').format('YYYY-MM-DD'), kind: 'EXPENSE', description: 'Stationery & office supplies', amount: 650, receipt_ref: 'RC-118', created_by: cashier, created_at: nowIso() },
      { id: uuid(), fund_id: fundId, tx_date: dayjs().subtract(8, 'day').format('YYYY-MM-DD'), kind: 'EXPENSE', description: 'Taxi fare - customs documentation', amount: 300, receipt_ref: 'RC-117', created_by: cashier, created_at: nowIso() },
    ]);
  }

  console.log('[seed] sample transactions seeded');
}

async function recordPaymentSample(
  db: any,
  input: { kind: 'VENDOR_PAYMENT' | 'CUSTOMER_RECEIPT' | 'EXPENSE' | 'PETTY_CASH'; vendor_id?: string; customer_id?: string; invoice_id?: string; amount: number; payment_date: string; method: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD'; bank_account_id?: string; reference?: string; description?: string | null; created_by?: string }
) {
  const { recordPayment } = await import('../services/paymentops');
  const user = await db.selectOne('users', { where: { id: input.created_by } });
  await recordPayment(db, user, {
    kind: input.kind,
    vendor_id: input.vendor_id,
    customer_id: input.customer_id,
    invoice_id: input.invoice_id,
    amount: input.amount,
    payment_date: input.payment_date,
    method: input.method,
    bank_account_id: input.bank_account_id,
    reference: input.reference,
    description: input.description ?? undefined,
  });
}

export async function seedIfEmpty() {
  try {
    await runSeed();
  } catch (e) {
    console.error('[seed] failed:', e);
  }
}
