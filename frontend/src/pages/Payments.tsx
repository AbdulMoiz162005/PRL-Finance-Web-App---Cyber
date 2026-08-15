import { useEffect, useMemo, useState } from 'react';
import { Plus, Check, XCircle, RotateCcw } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { PageHeader, Tabs, Badge, Modal, Confirm, EmptyState, LoadingBlock } from '../components/ui';
import type { Payment, Vendor, Customer, Invoice, BankAccount } from '../api/types';
import { fmtMoney, fmtDate, today } from '../lib/format';

type Kind = 'VENDOR_PAYMENT' | 'CUSTOMER_RECEIPT';

const KIND_LABEL: Record<Kind, string> = { VENDOR_PAYMENT: 'Supplier payments', CUSTOMER_RECEIPT: 'Customer receipts' };

export default function Payments() {
  const { user, hasRole } = useAuth();
  const { notify } = useToast();
  const [kind, setKind] = useState<Kind>('VENDOR_PAYMENT');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const canCreate = hasRole('CASHIER', 'ACCOUNTANT', 'FINANCE_MANAGER', 'FINANCE_DIRECTOR', 'SUPER_ADMIN');
  const canPost = hasRole('ACCOUNTANT', 'FINANCE_MANAGER', 'FINANCE_DIRECTOR', 'SUPER_ADMIN');
  const canManage = hasRole('FINANCE_MANAGER', 'FINANCE_DIRECTOR', 'SUPER_ADMIN');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<Payment[]>('/payments');
      setPayments(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => payments.filter((p) => p.kind === kind && (!status || p.status === status)), [payments, kind, status]);

  const act = async (fn: () => Promise<any>, msg: string) => {
    try {
      await fn();
      await load();
      notify('success', msg);
    } catch (err: any) {
      notify('error', 'Action failed', err.message);
    }
  };

  const total = filtered.reduce((s, p) => s + p.amount, 0);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Payments"
        sub={`${filtered.length} transactions`}
        actions={
          canCreate && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> Record {kind === 'VENDOR_PAYMENT' ? 'payment' : 'receipt'}
            </button>
          )
        }
      />

      <Tabs
        active={kind}
        onChange={(k) => setKind(k as Kind)}
        tabs={[
          { key: 'VENDOR_PAYMENT', label: 'Supplier Payments' },
          { key: 'CUSTOMER_RECEIPT', label: 'Customer Receipts' },
        ]}
      />

      <div className="filter-bar">
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="POSTED">Posted</option>
          <option value="RECONCILED">Reconciled</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>Total <strong>{fmtMoney(total)}</strong></span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Number</th>
                <th>{kind === 'VENDOR_PAYMENT' ? 'Vendor' : 'Customer'}</th>
                <th>Invoice</th>
                <th>Date</th>
                <th>Method</th>
                <th>Status</th>
                <th className="num">Amount</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td><span className="code-pill">{p.payment_number}</span></td>
                  <td style={{ fontWeight: 500 }}>{p.vendor?.name || p.customer?.name || '—'}</td>
                  <td className="muted">{p.invoice_id ? 'Linked' : '—'}</td>
                  <td>{fmtDate(p.payment_date)}</td>
                  <td className="muted">{p.method.replace(/_/g, ' ')}</td>
                  <td><Badge status={p.status} /></td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(p.amount)}</td>
                  <td className="actions">
                    {p.status === 'DRAFT' && canPost && (
                      <button className="btn btn-ghost btn-sm btn-icon" title="Post to GL" onClick={() => act(() => api.post(`/payments/${p.id}/post`), 'Payment posted')}><Check size={14} /></button>
                    )}
                    {p.status === 'POSTED' && canManage && (
                      <button className="btn btn-ghost btn-sm btn-icon" title="Reconcile" onClick={() => act(() => api.post(`/payments/${p.id}/reconcile`), 'Payment reconciled')}><RotateCcw size={14} /></button>
                    )}
                    {p.status !== 'RECONCILED' && p.status !== 'CANCELLED' && canManage && (
                      <button className="btn btn-ghost btn-sm btn-icon" title="Cancel" onClick={() => setCancelId(p.id)}><XCircle size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState title="No transactions found" />}
      </div>

      <PaymentForm open={showCreate} onClose={() => setShowCreate(false)} kind={kind} onSaved={() => { setShowCreate(false); load(); }} />

      <Confirm
        open={!!cancelId}
        onClose={() => setCancelId(null)}
        onConfirm={() => act(() => api.post(`/payments/${cancelId}/cancel`), 'Payment cancelled')}
        title="Cancel this payment?"
        message="The payment will be marked as cancelled. Reconciled payments cannot be cancelled."
        confirmText="Cancel payment"
        danger
      />
    </div>
  );
}

function PaymentForm({ open, onClose, kind, onSaved }: { open: boolean; onClose: () => void; kind: Kind; onSaved: () => void }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [parties, setParties] = useState<(Vendor | Customer)[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [form, setForm] = useState<any>({
    party_id: '',
    invoice_id: '',
    amount: '',
    payment_date: today(),
    method: 'BANK_TRANSFER',
    bank_account_id: '',
    reference: '',
    description: '',
  });

  useEffect(() => {
    if (!open) return;
    setForm({ party_id: '', invoice_id: '', amount: '', payment_date: today(), method: 'BANK_TRANSFER', bank_account_id: '', reference: '', description: '' });
    (kind === 'VENDOR_PAYMENT' ? api.get<Vendor[]>('/vendors') : api.get<Customer[]>('/customers')).then(setParties).catch(() => {});
    api.get<BankAccount[]>('/bank-accounts').then(setBanks).catch(() => {});
    api.get<Invoice[]>('/invoices').then((list) => setInvoices(list.filter((i) => i.kind === (kind === 'VENDOR_PAYMENT' ? 'AP' : 'AR') && i.status === 'POSTED' && (i.outstanding || 0) > 0))).catch(() => {});
  }, [open, kind]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/payments', {
        kind,
        [kind === 'VENDOR_PAYMENT' ? 'vendor_id' : 'customer_id']: form.party_id || null,
        invoice_id: form.invoice_id || null,
        amount: Number(form.amount),
        payment_date: form.payment_date,
        method: form.method,
        bank_account_id: form.bank_account_id || null,
        reference: form.reference || null,
        description: form.description || null,
      });
      notify('success', 'Transaction recorded', 'Post it to update the GL');
      onSaved();
    } catch (err: any) {
      notify('error', 'Failed to record payment', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={kind === 'VENDOR_PAYMENT' ? 'Record supplier payment' : 'Record customer receipt'}>
      <form onSubmit={submit}>
        <div className="field">
          <label>{kind === 'VENDOR_PAYMENT' ? 'Vendor' : 'Customer'} <span className="req">*</span></label>
          <select className="select" value={form.party_id} onChange={(e) => set('party_id', e.target.value)} required>
            <option value="">Select…</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Invoice</label>
            <select className="select" value={form.invoice_id} onChange={(e) => set('invoice_id', e.target.value)}>
              <option value="">— Not linked —</option>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>{i.invoice_number} · {fmtMoney(i.outstanding || 0)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Amount <span className="req">*</span></label>
            <input type="number" step="0.01" min="0.01" className="input" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" required />
          </div>
          <div className="field">
            <label>Date <span className="req">*</span></label>
            <input type="date" className="input" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required />
          </div>
          <div className="field">
            <label>Method <span className="req">*</span></label>
            <select className="select" value={form.method} onChange={(e) => set('method', e.target.value)}>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
            </select>
          </div>
          <div className="field">
            <label>Bank account</label>
            <select className="select" value={form.bank_account_id} onChange={(e) => set('bank_account_id', e.target.value)}>
              <option value="">—</option>
              {banks.filter((b) => b.is_active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Reference</label>
            <input className="input" value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="e.g. wire ref / cheque #" />
          </div>
        </div>
        <div className="field">
          <label>Description</label>
          <textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Record transaction'}</button>
        </div>
      </form>
    </Modal>
  );
}
