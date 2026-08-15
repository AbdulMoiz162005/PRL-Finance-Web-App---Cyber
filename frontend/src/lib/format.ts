import dayjs from 'dayjs';

export function fmtMoney(n: number | null | undefined, symbol = '$'): string {
  const v = Number(n || 0);
  return `${symbol}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtCompact(n: number | null | undefined, symbol = '$'): string {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${symbol}${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${symbol}${(v / 1_000).toFixed(1)}K`;
  return `${symbol}${v.toFixed(0)}`;
}

export function fmtNum(n: number | null | undefined, digits = 2): string {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return dayjs(d).format('DD MMM YYYY');
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  return dayjs(d).format('DD MMM YYYY HH:mm');
}

export function today(): string {
  return dayjs().format('YYYY-MM-DD');
}

export function monthStart(): string {
  return dayjs().startOf('month').format('YYYY-MM-DD');
}

export function yearStart(): string {
  return dayjs().startOf('year').format('YYYY-MM-DD');
}

export function lastMonthStart(): string {
  return dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
}

export function lastMonthEnd(): string {
  return dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD');
}

export const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#8a94a6',
  SUBMITTED: '#b98a00',
  APPROVED: '#0d9488',
  POSTED: '#2563eb',
  PAID: '#16a34a',
  PARTIALLY_PAID: '#0891b2',
  OVERDUE: '#dc2626',
  CANCELLED: '#6b7280',
  RECONCILED: '#16a34a',
  REVERSED: '#dc2626',
  ACTIVE: '#16a34a',
  INACTIVE: '#6b7280',
  DISABLED: '#6b7280',
  DRAFTED: '#8a94a6',
};

export function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
