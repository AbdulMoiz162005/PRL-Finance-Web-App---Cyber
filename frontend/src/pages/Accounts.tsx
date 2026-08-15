import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Pencil, FolderTree } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { PageHeader, Modal, Badge, TypeTag, EmptyState, LoadingBlock } from '../components/ui';
import type { Account } from '../api/types';
import { fmtMoney } from '../lib/format';

export default function Accounts() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<Account | null>(null);
  const [treeView, setTreeView] = useState(false);

  const canEdit = !!user && ['SUPER_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_MANAGER', 'ACCOUNTANT'].includes(user.role);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<Account[]>('/accounts');
      setAccounts(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      if (type && a.type !== type) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!a.code.toLowerCase().includes(q) && !a.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [accounts, type, search]);

  const types = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
  const byType = types.map((t) => ({ type: t, items: filtered.filter((a) => a.type === t) }));

  const totals = (items: Account[]) => items.reduce((s, a) => s + (a.balance || 0), 0);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Chart of Accounts"
        sub={`${accounts.length} accounts`}
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setTreeView((v) => !v)}>
              <FolderTree size={15} /> {treeView ? 'List view' : 'Tree view'}
            </button>
            {canEdit && (
              <button className="btn btn-primary" onClick={() => { setEdit(null); setShowForm(true); }}>
                <Plus size={15} /> New account
              </button>
            )}
          </>
        }
      />

      <div className="filter-bar">
        <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-3)' }} />
          <input className="input" placeholder="Search code or name…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
      </div>

      {filtered.length === 0 && <EmptyState title="No accounts found" />}

      {!treeView &&
        byType.map(({ type: t, items }) =>
          items.length > 0 ? (
            <div className="card" key={t} style={{ marginBottom: 18 }}>
              <div className="card-header">
                <div className="card-title" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <TypeTag type={t} /> <span>{items.length} accounts</span>
                </div>
                <div className="card-sub">{fmtMoney(totals(items))}</div>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Account name</th>
                      <th>Category</th>
                      <th>Normal balance</th>
                      <th>Status</th>
                      <th className="num">Balance</th>
                      <th className="actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((a) => (
                      <tr key={a.id}>
                        <td><span className="code-pill">{a.code}</span></td>
                        <td>
                          <Link to={`/accounts/${a.id}`} style={{ fontWeight: 600, color: 'var(--text)' }}>{a.name}</Link>
                        </td>
                        <td className="muted">{a.category || '—'}</td>
                        <td className="muted">{a.normal_balance}</td>
                        <td>{a.is_active ? <Badge status="ACTIVE" label="Active" /> : <Badge status="DISABLED" label="Inactive" />}</td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {a.balance != null ? <span className={a.balance < 0 ? 'neg' : 'pos'}>{fmtMoney(a.balance)}</span> : '—'}
                        </td>
                        <td className="actions">
                          {canEdit && (
                            <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => { setEdit(a); setShowForm(true); }}>
                              <Pencil size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null,
        )}

      {treeView && <AccountTree accounts={accounts} />}

      <AccountForm open={showForm} onClose={() => setShowForm(false)} account={edit} accounts={accounts} onSaved={() => { setShowForm(false); load(); notify('success', edit ? 'Account updated' : 'Account created'); }} />
    </div>
  );
}

function AccountTree({ accounts }: { accounts: Account[] }) {
  const children = (parentId: string | null) => accounts.filter((a) => (a.parent_id || null) === parentId);
  const walk = (parentId: string | null, depth: number): React.ReactNode =>
    children(parentId).map((a) => (
      <div key={a.id}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', paddingLeft: depth * 20 }}>
          <span className="code-pill">{a.code}</span>
          <Link to={`/accounts/${a.id}`} style={{ fontWeight: 500 }}>{a.name}</Link>
          <span className="muted" style={{ fontSize: 12 }}>{a.normal_balance}</span>
          <div style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 12 }}>{a.balance != null ? fmtMoney(a.balance) : ''}</span>
        </div>
        {walk(a.id, depth + 1)}
      </div>
    ));
  return (
    <div className="card card-pad">
      {walk(null, 0)}
    </div>
  );
}

function AccountForm({ open, onClose, account, accounts, onSaved }: {
  open: boolean;
  onClose: () => void;
  account: Account | null;
  accounts: Account[];
  onSaved: () => void;
}) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    code: '',
    name: '',
    type: 'ASSET',
    category: '',
    parent_id: '',
    normal_balance: 'DEBIT',
    is_active: true,
    description: '',
  });

  useEffect(() => {
    if (open) {
      setForm({
        code: account?.code || '',
        name: account?.name || '',
        type: account?.type || 'ASSET',
        category: account?.category || '',
        parent_id: account?.parent_id || '',
        normal_balance: account?.normal_balance || 'DEBIT',
        is_active: account?.is_active ?? true,
        description: account?.description || '',
      });
    }
  }, [open, account]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (account) {
        await api.put(`/accounts/${account.id}`, {
          name: form.name,
          category: form.category || null,
          parent_id: form.parent_id || null,
          is_active: form.is_active,
          description: form.description || null,
        });
      } else {
        await api.post('/accounts', {
          code: form.code,
          name: form.name,
          type: form.type,
          category: form.category || null,
          parent_id: form.parent_id || null,
          normal_balance: form.normal_balance,
          is_active: true,
          description: form.description || null,
        });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      notify('error', 'Failed to save account', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={account ? `Edit ${account.code} · ${account.name}` : 'New account'}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>Account code <span className="req">*</span></label>
            <input className="input" value={form.code} onChange={(e) => set('code', e.target.value)} disabled={!!account} placeholder="e.g. 1050" required />
          </div>
          <div className="field">
            <label>Type <span className="req">*</span></label>
            <select className="select" value={form.type} onChange={(e) => { set('type', e.target.value); set('normal_balance', e.target.value === 'ASSET' || e.target.value === 'EXPENSE' ? 'DEBIT' : 'CREDIT'); }} disabled={!!account}>
              {['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Account name <span className="req">*</span></label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Storage Tank Fees" required />
          </div>
          <div className="field">
            <label>Category</label>
            <input className="input" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Current Asset" />
          </div>
          <div className="field">
            <label>Parent account</label>
            <select className="select" value={form.parent_id} onChange={(e) => set('parent_id', e.target.value)}>
              <option value="">— None —</option>
              {accounts.filter((a) => a.id !== account?.id).map((a) => (
                <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Normal balance</label>
            <select className="select" value={form.normal_balance} onChange={(e) => set('normal_balance', e.target.value)} disabled={!!account}>
              <option value="DEBIT">Debit</option>
              <option value="CREDIT">Credit</option>
            </select>
          </div>
          <div className="field" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
            <label className="checkbox-row">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
              Active
            </label>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Description</label>
            <textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : account ? 'Save changes' : 'Create account'}</button>
        </div>
      </form>
    </Modal>
  );
}
