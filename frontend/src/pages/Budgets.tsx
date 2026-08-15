import { useEffect, useState } from 'react';
import { Plus, Pencil, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { PageHeader, Modal, Badge, EmptyState, LoadingBlock, Confirm } from '../components/ui';
import type { Budget, Department, Account } from '../api/types';
import { fmtMoney } from '../lib/format';

export default function Budgets() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [approveId, setApproveId] = useState<string | null>(null);

  const canManage = !!user && ['SUPER_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_MANAGER'].includes(user.role);

  const load = async () => {
    setLoading(true);
    try {
      setBudgets(await api.get<Budget[]>('/budgets'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (fn: () => Promise<any>, msg: string) => {
    try {
      await fn();
      await load();
      notify('success', msg);
    } catch (err: any) {
      notify('error', 'Action failed', err.message);
    }
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Budgets"
        sub={`${budgets.length} budgets`}
        actions={
          canManage && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={15} /> New budget
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
                <th>Fiscal year</th>
                <th>Department</th>
                <th className="num">Total</th>
                <th>Status</th>
                <th className="actions"></th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 600 }}>{b.name}</td>
                  <td className="muted">{b.fiscal_year}</td>
                  <td className="muted">{b.department?.name || 'Company-wide'}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(b.total)}</td>
                  <td><Badge status={b.status} /></td>
                  <td className="actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditId(b.id)}><Pencil size={13} /> Edit lines</button>
                    {canManage && b.status === 'DRAFT' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setApproveId(b.id)}><CheckCircle2 size={13} /> Approve</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {budgets.length === 0 && <EmptyState title="No budgets yet" sub="Create an annual budget to track performance" />}
      </div>

      <BudgetForm open={showForm} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />
      <BudgetLines id={editId} onClose={() => setEditId(null)} onSaved={() => load()} />

      <Confirm
        open={!!approveId}
        onClose={() => setApproveId(null)}
        onConfirm={() => act(() => api.post(`/budgets/${approveId}/status`, { status: 'APPROVED' }), 'Budget approved')}
        title="Approve this budget?"
        message="Once approved, the budget is locked for the fiscal year."
        confirmText="Approve"
      />
    </div>
  );
}

function BudgetForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [depts, setDepts] = useState<Department[]>([]);
  const [form, setForm] = useState<any>({ name: '', fiscal_year: String(new Date().getFullYear()), department_id: '' });

  useEffect(() => {
    if (!open) return;
    api.get<Department[]>('/departments').then(setDepts).catch(() => {});
    setForm({ name: '', fiscal_year: String(new Date().getFullYear()), department_id: '' });
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/budgets', {
        name: form.name,
        fiscal_year: Number(form.fiscal_year),
        department_id: form.department_id || null,
      });
      onSaved();
    } catch (err: any) {
      notify('error', 'Failed to create budget', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New budget">
      <form onSubmit={submit}>
        <div className="field">
          <label>Budget name <span className="req">*</span></label>
          <input className="input" value={form.name} onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="e.g. FY2026 Operations Budget" required />
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Fiscal year <span className="req">*</span></label>
            <input type="number" min="2000" max="2100" className="input" value={form.fiscal_year} onChange={(e) => setForm((f: any) => ({ ...f, fiscal_year: e.target.value }))} required />
          </div>
          <div className="field">
            <label>Department</label>
            <select className="select" value={form.department_id} onChange={(e) => setForm((f: any) => ({ ...f, department_id: e.target.value }))}>
              <option value="">Company-wide</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create budget'}</button>
        </div>
      </form>
    </Modal>
  );
}

function BudgetLines({ id, onClose, onSaved }: { id: string | null; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const [budget, setBudget] = useState<any>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lines, setLines] = useState<Record<string, Record<number, string>>>({});
  const [busy, setBusy] = useState(false);
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);

  useEffect(() => {
    if (!id) return;
    setBudget(null);
    api.get<any>(`/budgets/${id}`).then((b) => {
      setBudget(b);
      const map: Record<string, Record<number, string>> = {};
      for (const l of b.lines) {
        if (!map[l.account_id]) map[l.account_id] = {};
        map[l.account_id][l.month] = String(l.amount);
      }
      setLines(map);
    }).catch(() => {});
    api.get<Account[]>('/accounts').then((list) => setExpenseAccounts(list.filter((a) => a.type === 'EXPENSE'))).catch(() => {});
  }, [id]);

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const monthLabel = (m: number) => new Date(2000, m - 1, 1).toLocaleString('en-US', { month: 'short' });

  const accountTotal = (accId: string) => months.reduce((s, m) => s + (Number(lines[accId]?.[m]) || 0), 0);
  const grandTotal = Object.keys(lines).reduce((s, accId) => s + accountTotal(accId), 0);

  const submit = async () => {
    setBusy(true);
    try {
      const payload: { account_id: string; month: number; amount: number }[] = [];
      for (const accId of Object.keys(lines)) {
        for (const m of months) {
          const amt = Number(lines[accId]?.[m]) || 0;
          if (amt > 0) payload.push({ account_id: accId, month: m, amount: amt });
        }
      }
      await api.post(`/budgets/${id}/lines`, { lines: payload });
      notify('success', 'Budget lines saved');
      onSaved();
      onClose();
    } catch (err: any) {
      notify('error', 'Failed to save lines', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!id} onClose={onClose} title={budget ? `Budget lines · ${budget.name} (${budget.fiscal_year})` : 'Budget lines'} wide>
      {!budget ? (
        <LoadingBlock />
      ) : (
        <div>
          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Expense account</th>
                  {months.map((m) => (
                    <th key={m} className="num" style={{ minWidth: 64 }}>{monthLabel(m)}</th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {expenseAccounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="code-pill">{a.code}</span> <span className="muted">{a.name}</span>
                    </td>
                    {months.map((m) => (
                      <td key={m}>
                        <input type="number" step="0.01" min="0" className="input" style={{ textAlign: 'right', padding: '4px 6px' }} value={lines[a.id]?.[m] ?? ''} onChange={(e) => setLines((prev) => ({ ...prev, [a.id]: { ...(prev[a.id] || {}), [m]: e.target.value } }))} />
                      </td>
                    ))}
                    <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(accountTotal(a.id))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <td style={{ fontWeight: 700 }}>Total</td>
                  {months.map((m) => (
                    <td key={m} className="num" style={{ fontWeight: 700 }}>{fmtMoney(Object.keys(lines).reduce((s, accId) => s + (Number(lines[accId]?.[m]) || 0), 0))}</td>
                  ))}
                  <td className="num" style={{ fontWeight: 800 }}>{fmtMoney(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save budget lines'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
