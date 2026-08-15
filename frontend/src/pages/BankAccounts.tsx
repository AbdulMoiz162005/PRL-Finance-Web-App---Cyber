import { useEffect, useState } from 'react';
import { Plus, Pencil, Eye } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { PageHeader, Modal, Badge, EmptyState, LoadingBlock } from '../components/ui';
import type { BankAccount, Account } from '../api/types';
import { fmtMoney, fmtDate, yearStart, today } from '../lib/format';

export default function BankAccounts() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<BankAccount | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);

  const canEdit = !!user && ['SUPER_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_MANAGER', 'ACCOUNTANT'].includes(user.role);

  const load = async () => {
    setLoading(true);
    try {
      setBanks(await api.get<BankAccount[]>('/bank-accounts'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const total = banks.reduce((s, b) => s + (b.balance || 0), 0);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Bank Accounts"
        sub={`${banks.length} accounts · total ${fmtMoney(total)}`}
        actions={
          canEdit && (
            <button className="btn btn-primary" onClick={() => { setEdit(null); setShowForm(true); }}>
              <Plus size={15} /> New bank account
            </button>
          )
        }
      />

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Bank</th>
                <th>Account no.</th>
                <th>GL account</th>
                <th className="num">Balance</th>
                <th>Status</th>
                <th className="actions"></th>
              </tr>
            </thead>
            <tbody>
              {banks.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 600 }}>{b.name}</td>
                  <td className="muted">{b.bank_name}</td>
                  <td className="muted">{b.account_number || '—'}</td>
                  <td className="muted">{b.gl_account_id ? 'Linked' : '—'}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(b.balance || 0)}</td>
                  <td>{b.is_active ? <Badge status="ACTIVE" label="Active" /> : <Badge status="DISABLED" label="Inactive" />}</td>
                  <td className="actions">
                    <button className="btn btn-ghost btn-sm btn-icon" title="Transactions" onClick={() => setViewId(b.id)}><Eye size={14} /></button>
                    {canEdit && (
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEdit(b); setShowForm(true); }}><Pencil size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {banks.length === 0 && <EmptyState title="No bank accounts" />}
      </div>

      <BankForm open={showForm} onClose={() => setShowForm(false)} bank={edit} onSaved={() => { setShowForm(false); load(); }} />
      <BankTransactions id={viewId} onClose={() => setViewId(null)} />
    </div>
  );
}

function BankForm({ open, onClose, bank, onSaved }: { open: boolean; onClose: () => void; bank: BankAccount | null; onSaved: () => void }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState<any>({ name: '', bank_name: '', account_number: '', gl_account_id: '', opening_balance: '0', is_active: true });

  useEffect(() => {
    if (!open) return;
    api.get<Account[]>('/accounts').then((list) => setAccounts(list.filter((a) => a.code.startsWith('10')))).catch(() => {});
    setForm({
      name: bank?.name || '', bank_name: bank?.bank_name || '', account_number: bank?.account_number || '',
      gl_account_id: bank?.gl_account_id || '', opening_balance: String(bank?.opening_balance ?? 0), is_active: bank?.is_active ?? true,
    });
  }, [open, bank]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        bank_name: form.bank_name,
        account_number: form.account_number || null,
        gl_account_id: form.gl_account_id || null,
        opening_balance: Number(form.opening_balance) || 0,
        is_active: form.is_active,
      };
      if (bank) await api.put(`/bank-accounts/${bank.id}`, payload);
      else await api.post('/bank-accounts', payload);
      onSaved();
    } catch (err: any) {
      notify('error', 'Failed to save bank account', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={bank ? `Edit ${bank.name}` : 'New bank account'}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>Account name <span className="req">*</span></label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="e.g. Main Operating" />
          </div>
          <div className="field">
            <label>Bank <span className="req">*</span></label>
            <input className="input" value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} required />
          </div>
          <div className="field">
            <label>Account number</label>
            <input className="input" value={form.account_number} onChange={(e) => set('account_number', e.target.value)} />
          </div>
          <div className="field">
            <label>Opening balance</label>
            <input type="number" step="0.01" className="input" value={form.opening_balance} onChange={(e) => set('opening_balance', e.target.value)} />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>GL account (cash)</label>
            <select className="select" value={form.gl_account_id} onChange={(e) => set('gl_account_id', e.target.value)}>
              <option value="">— None —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : bank ? 'Save changes' : 'Create account'}</button>
        </div>
      </form>
    </Modal>
  );
}

function BankTransactions({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [data, setData] = useState<{ bank: any; rows: { entry_number: string; date: string; description: string; debit: number; credit: number }[]; balance: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    setData(null);
    api.get<any>(`/bank-accounts/${id}/transactions?from=${yearStart()}&to=${today()}`).then(setData).catch(() => {});
  }, [id]);

  return (
    <Modal open={!!id} onClose={onClose} title={data?.bank?.name || 'Bank transactions'} wide>
      {!data ? (
        <LoadingBlock />
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <span className="muted">GL account balance</span>
            <span style={{ fontSize: 18, fontWeight: 800 }}>{fmtMoney(data.balance)}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Entry</th>
                  <th>Description</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{fmtDate(r.date)}</td>
                    <td><span className="code-pill">{r.entry_number}</span></td>
                    <td>{r.description}</td>
                    <td className="num">{r.debit ? fmtMoney(r.debit) : ''}</td>
                    <td className="num">{r.credit ? fmtMoney(r.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.rows.length === 0 && <EmptyState title="No transactions in period" />}
        </div>
      )}
    </Modal>
  );
}
