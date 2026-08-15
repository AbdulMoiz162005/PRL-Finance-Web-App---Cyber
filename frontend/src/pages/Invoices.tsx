import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Send, Check, XCircle, Eye } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { PageHeader, Tabs, Badge, Modal, Confirm, EmptyState, LoadingBlock } from '../components/ui';
import type { Invoice, Vendor, Customer, Account } from '../api/types';
import { fmtMoney, fmtDate, today } from '../lib/format';

interface TaxRate { id: string; name: string; rate: number }

export default function Invoices() {
  const { user, hasRole } = useAuth();
  const { notify } = useToast();
  const [kind, setKind] = useState<'AP' | 'AR'>('AR');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canCreate = hasRole('ACCOUNTANT', 'FINANCE_MANAGER', 'FINANCE_DIRECTOR', 'SUPER_ADMIN');
  const canManage = hasRole('FINANCE_MANAGER', 'FINANCE_DIRECTOR', 'SUPER_ADMIN');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<Invoice[]>('/invoices');
      setInvoices(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => invoices.filter((i) => i.kind === kind && (!status || i.status === status)), [invoices, kind, status]);

  const act = async (fn: () => Promise<any>, msg: string) => {
    try {
      await fn();
      await load();
      notify('success', msg);
    } catch (err: any) {
      notify('error', 'Action failed', err.message);
    }
  };

  const totals = {
    total: filtered.reduce((s, i) => s + i.total, 0),
    outstanding: filtered.reduce((s, i) => s + (i.outstanding || 0), 0),
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Invoices"
        sub={`${filtered.length} ${kind === 'AR' ? 'customer' : 'supplier'} invoices`}
        actions={
          canCreate && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> New {kind === 'AR' ? 'invoice' : 'bill'}
            </button>
          )
        }
      />

      <Tabs
        active={kind}
        onChange={(k) => setKind(k as 'AP' | 'AR')}
        tabs={[
          { key: 'AR', label: 'Accounts Receivable' },
          { key: 'AP', label: 'Accounts Payable' },
        ]}
      />

      <div className="filter-bar">
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED'].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 16, marginLeft: 'auto' }}>
          <span className="muted" style={{ fontSize: 12 }}>Total <strong>{fmtMoney(totals.total)}</strong></span>
          <span className="muted" style={{ fontSize: 12 }}>Outstanding <strong>{fmtMoney(totals.outstanding)}</strong></span>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Number</th>
                <th>{kind === 'AR' ? 'Customer' : 'Vendor'}</th>
                <th>Date</th>
                <th>Due date</th>
                <th>Status</th>
                <th className="num">Total</th>
                <th className="num">Outstanding</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id}>
                  <td><span className="code-pill">{inv.invoice_number}</span></td>
                  <td style={{ fontWeight: 500 }}>{inv.party?.name || '—'}</td>
                  <td>{fmtDate(inv.invoice_date)}</td>
                  <td>{fmtDate(inv.due_date)}</td>
                  <td><Badge status={inv.outstanding > 0 && inv.status === 'POSTED' ? 'OVERDUE' : inv.status} label={inv.status === 'POSTED' && inv.outstanding > 0 ? 'POSTED' : inv.status} /></td>
                  <td className="num">{fmtMoney(inv.total)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(inv.outstanding || 0)}</td>
                  <td className="actions">
                    <button className="btn btn-ghost btn-sm btn-icon" title="View" onClick={() => setDetailId(inv.id)}><Eye size={14} /></button>
                    {inv.status === 'DRAFT' && canCreate && (
                      <button className="btn btn-ghost btn-sm btn-icon" title="Submit" onClick={() => act(() => api.post(`/invoices/${inv.id}/submit`), 'Invoice submitted')}><Send size={14} /></button>
                    )}
                    {inv.status === 'SUBMITTED' && canManage && (
                      <button className="btn btn-ghost btn-sm btn-icon" title="Approve" onClick={() => act(() => api.post(`/invoices/${inv.id}/approve`), 'Invoice approved')}><Check size={14} /></button>
                    )}
                    {(inv.status === 'APPROVED' || (inv.status === 'SUBMITTED' && hasRole('FINANCE_MANAGER', 'FINANCE_DIRECTOR', 'SUPER_ADMIN'))) && canCreate && (
                      <button className="btn btn-ghost btn-sm btn-icon" title="Post" onClick={() => act(() => api.post(`/invoices/${inv.id}/post`), 'Invoice posted to GL')}><Check size={14} /></button>
                    )}
                    {['DRAFT', 'SUBMITTED'].includes(inv.status) && canManage && (
                      <button className="btn btn-ghost btn-sm btn-icon" title="Cancel" onClick={() => setCancelId(inv.id)}><XCircle size={14} /></button>
                    )}
                    {inv.status === 'DRAFT' && canCreate && (
                      <button className="btn btn-ghost btn-sm btn-icon" title="Delete" onClick={() => setDeleteId(inv.id)}><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState title={`No ${kind === 'AR' ? 'invoices' : 'bills'} found`} />}
      </div>

      <InvoiceForm
        open={showCreate}
        onClose={() => setShowCreate(false)}
        kind={kind}
        onSaved={() => { setShowCreate(false); load(); }}
      />

      <InvoiceDetail id={detailId} onClose={() => setDetailId(null)} onChanged={load} />

      <Confirm
        open={!!cancelId}
        onClose={() => setCancelId(null)}
        onConfirm={() => act(() => api.post(`/invoices/${cancelId}/cancel`), 'Invoice cancelled')}
        title="Cancel this invoice?"
        message="The invoice will be marked as cancelled. Posted or paid invoices cannot be cancelled."
        confirmText="Cancel invoice"
        danger
      />

      <Confirm
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => act(async () => { await api.del(`/invoices/${deleteId}`); }, 'Invoice deleted')}
        title="Delete this invoice?"
        message="Only draft invoices can be deleted. This cannot be undone."
        confirmText="Delete"
        danger
      />
    </div>
  );
}

function InvoiceForm({ open, onClose, kind, onSaved }: { open: boolean; onClose: () => void; kind: 'AP' | 'AR'; onSaved: () => void }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [parties, setParties] = useState<(Vendor | Customer)[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxes, setTaxes] = useState<TaxRate[]>([]);
  const [form, setForm] = useState<any>({
    party_id: '',
    invoice_date: today(),
    due_date: '',
    notes: '',
    lines: [{ description: '', quantity: '1', unit_price: '', account_id: '', tax_rate_id: '' }],
  });

  useEffect(() => {
    if (!open) return;
    api.get<Account[]>('/accounts').then(setAccounts).catch(() => {});
    api.get<TaxRate[]>('/settings/tax-rates').then(setTaxes).catch(() => {});
    setForm({
      party_id: '',
      invoice_date: today(),
      due_date: '',
      notes: '',
      lines: [{ description: '', quantity: '1', unit_price: '', account_id: '', tax_rate_id: '' }],
    });
    (kind === 'AP' ? api.get<Vendor[]>('/vendors') : api.get<Customer[]>('/customers')).then(setParties).catch(() => {});
  }, [open, kind]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const setLine = (i: number, k: string, v: string) => setForm((f: any) => ({ ...f, lines: f.lines.map((l: any, idx: number) => (idx === i ? { ...l, [k]: v } : l)) }));
  const addLine = () => setForm((f: any) => ({ ...f, lines: [...f.lines, { description: '', quantity: '1', unit_price: '', account_id: '', tax_rate_id: '' }] }));

  const lineTotal = (l: any) => (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
  const subtotal = form.lines.reduce((s: number, l: any) => s + lineTotal(l), 0);
  const taxAmount = form.lines.reduce((s: number, l: any) => {
    const rate = taxes.find((t) => t.id === l.tax_rate_id)?.rate || 0;
    return s + lineTotal(l) * (rate / 100);
  }, 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/invoices', {
        kind,
        [kind === 'AP' ? 'vendor_id' : 'customer_id']: form.party_id || null,
        invoice_date: form.invoice_date,
        due_date: form.due_date || null,
        notes: form.notes || null,
        lines: form.lines.map((l: any) => ({
          description: l.description,
          quantity: Number(l.quantity) || 0,
          unit_price: Number(l.unit_price) || 0,
          account_id: l.account_id || null,
          tax_rate_id: l.tax_rate_id || null,
        })),
      });
      notify('success', `${kind === 'AR' ? 'Invoice' : 'Bill'} created`, 'Submit and approve before posting');
      onSaved();
    } catch (err: any) {
      notify('error', 'Failed to create invoice', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`New ${kind === 'AR' ? 'customer invoice' : 'supplier bill'}`} wide>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>{kind === 'AP' ? 'Vendor' : 'Customer'} <span className="req">*</span></label>
            <select className="select" value={form.party_id} onChange={(e) => set('party_id', e.target.value)} required>
              <option value="">Select…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Invoice date <span className="req">*</span></label>
            <input type="date" className="input" value={form.invoice_date} onChange={(e) => set('invoice_date', e.target.value)} required />
          </div>
          <div className="field">
            <label>Due date</label>
            <input type="date" className="input" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
          </div>
          <div className="field">
            <label>Notes</label>
            <input className="input" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        <div className="section-title">Line items</div>
        <div className="table-wrap" style={{ marginBottom: 14 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Description</th>
                <th className="num" style={{ width: 90 }}>Qty</th>
                <th className="num" style={{ width: 110 }}>Unit price</th>
                <th style={{ width: 180 }}>Account</th>
                <th style={{ width: 110 }}>Tax</th>
                <th className="num" style={{ width: 110 }}>Amount</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {form.lines.map((l: any, i: number) => (
                <tr key={i}>
                  <td className="muted">{i + 1}</td>
                  <td><input className="input" value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} required placeholder="Description" /></td>
                  <td><input type="number" min="0" step="0.01" className="input" style={{ textAlign: 'right' }} value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} /></td>
                  <td><input type="number" min="0" step="0.01" className="input" style={{ textAlign: 'right' }} value={l.unit_price} onChange={(e) => setLine(i, 'unit_price', e.target.value)} /></td>
                  <td>
                    <select className="select" value={l.account_id} onChange={(e) => setLine(i, 'account_id', e.target.value)}>
                      <option value="">—</option>
                      {accounts.filter((a) => (kind === 'AP' ? a.type === 'EXPENSE' : a.type === 'REVENUE')).map((a) => (
                        <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select className="select" value={l.tax_rate_id} onChange={(e) => setLine(i, 'tax_rate_id', e.target.value)}>
                      <option value="">No tax</option>
                      {taxes.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>)}
                    </select>
                  </td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmtMoney(lineTotal(l))}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setForm((f: any) => ({ ...f, lines: f.lines.filter((_: any, idx: number) => idx !== i) }))} disabled={form.lines.length <= 1}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--surface-2)' }}>
                <td colSpan={6} style={{ fontWeight: 700 }}>Subtotal</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(subtotal)}</td>
                <td></td>
              </tr>
              <tr style={{ background: 'var(--surface-2)' }}>
                <td colSpan={6} style={{ fontWeight: 700 }}>Tax</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(taxAmount)}</td>
                <td></td>
              </tr>
              <tr style={{ background: 'var(--surface-2)' }}>
                <td colSpan={6} style={{ fontWeight: 800 }}>Total</td>
                <td className="num" style={{ fontWeight: 800 }}>{fmtMoney(subtotal + taxAmount)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addLine}><Plus size={14} /> Add line</button>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : `Create ${kind === 'AR' ? 'invoice' : 'bill'}`}</button>
        </div>
      </form>
    </Modal>
  );
}

function InvoiceDetail({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { notify } = useToast();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    setData(null);
    api.get<any>(`/invoices/${id}`).then(setData).catch(() => {});
  }, [id]);

  return (
    <Modal open={!!id} onClose={onClose} title={data ? data.invoice_number : 'Invoice'} wide>
      {!data ? (
        <LoadingBlock />
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{data.party?.name}</div>
              <div className="muted">{data.kind === 'AR' ? 'Customer invoice' : 'Supplier bill'} · {fmtDate(data.invoice_date)}{data.due_date ? ` · due ${fmtDate(data.due_date)}` : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Badge status={data.status} />
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{fmtMoney(data.total)}</div>
              <div className="muted">Outstanding {fmtMoney(data.outstanding || 0)}</div>
            </div>
          </div>

          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price</th>
                  <th className="num">Tax</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l: any) => (
                  <tr key={l.id}>
                    <td>
                      {l.description}
                      {l.account && <div className="muted" style={{ fontSize: 11.5 }}>{l.account.code} · {l.account.name}</div>}
                    </td>
                    <td className="num">{l.quantity}</td>
                    <td className="num">{fmtMoney(l.unit_price)}</td>
                    <td className="num">{l.tax_rate ? `${l.tax_rate.name} ${l.tax_rate.rate}%` : '—'}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{fmtMoney(l.line_total || l.amount || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.payments?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="section-title">Payments received / made</div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Date</th>
                      <th>Method</th>
                      <th>Status</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p: any) => (
                      <tr key={p.id}>
                        <td><span className="code-pill">{p.payment_number}</span></td>
                        <td>{fmtDate(p.payment_date)}</td>
                        <td className="muted">{p.method}</td>
                        <td><Badge status={p.status} /></td>
                        <td className="num" style={{ fontWeight: 600 }}>{fmtMoney(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.notes && <div className="muted" style={{ fontSize: 12.5 }}>Notes: {data.notes}</div>}
        </div>
      )}
    </Modal>
  );
}
