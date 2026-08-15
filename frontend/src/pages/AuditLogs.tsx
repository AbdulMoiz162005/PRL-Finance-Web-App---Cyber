import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { PageHeader, LoadingBlock, EmptyState } from '../components/ui';
import { fmtDateTime } from '../lib/format';

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entity_id: string;
  email: string;
  user_name: string;
  old_value: any;
  new_value: any;
  created_at: string;
}

const ENTITIES = ['', 'user', 'account', 'journal_entry', 'invoice', 'payment', 'vendor', 'customer', 'bank_account', 'budget', 'petty_cash_fund', 'fixed_asset', 'department', 'currency', 'tax_rate', 'company_settings'];

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get<AuditLog[]>('/audit-logs?limit=500').then(setLogs).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      logs.filter((l) => {
        if (entity && l.entity !== entity) return false;
        if (action && !l.action.toLowerCase().includes(action.toLowerCase())) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!l.user_name.toLowerCase().includes(q) && !l.action.toLowerCase().includes(q) && !l.entity.toLowerCase().includes(q)) return false;
        }
        return true;
      }),
    [logs, entity, action, search],
  );

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader title="Audit Logs" sub={`${filtered.length} records`} />

      <div className="filter-bar">
        <select className="select" value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">All entities</option>
          {ENTITIES.filter(Boolean).map((e) => <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>)}
        </select>
        <input className="input" placeholder="Filter by action or user…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 240 }} />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td className="muted">{fmtDateTime(l.created_at)}</td>
                  <td style={{ fontWeight: 600 }}>{l.user_name}</td>
                  <td><span className="code-pill">{l.action}</span></td>
                  <td className="muted">{l.entity}</td>
                  <td>
                    <ChangeDiff oldV={l.old_value} newV={l.new_value} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState title="No audit records" />}
      </div>
    </div>
  );
}

function ChangeDiff({ oldV, newV }: { oldV: any; newV: any }) {
  const summarize = (v: any): string => {
    if (!v) return '—';
    if (typeof v === 'string') {
      try { return summarize(JSON.parse(v)); } catch { return v; }
    }
    if (typeof v === 'object') {
      const keys = Object.keys(v).filter((k) => !['id', 'password_hash', 'created_at', 'updated_at', 'last_login_at', 'is_system', 'normal_balance'].includes(k));
      return keys.map((k) => `${k}=${v[k]}`).slice(0, 3).join(', ');
    }
    return String(v);
  };
  if (!oldV && !newV) return <span className="muted">—</span>;
  if (oldV && newV) return <span className="muted" style={{ fontSize: 12 }}>{summarize(oldV)} → <span style={{ color: 'var(--green)' }}>{summarize(newV)}</span></span>;
  return <span className="muted" style={{ fontSize: 12 }}>{summarize(newV || oldV)}</span>;
}
