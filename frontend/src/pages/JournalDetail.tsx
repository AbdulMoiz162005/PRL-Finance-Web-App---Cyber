import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Send, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { LoadingBlock, Badge, Modal, Confirm, EmptyState } from '../components/ui';
import type { JournalEntry } from '../api/types';
import { fmtMoney, fmtDate, fmtDateTime } from '../lib/format';

export default function JournalDetail() {
  const { id } = useParams();
  const { user, hasRole } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReverse, setShowReverse] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const load = async () => {
    const data = await api.get<JournalEntry>(`/journals/${id}`);
    setEntry(data);
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingBlock />;
  if (!entry) return <EmptyState title="Journal entry not found" />;

  const debit = entry.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credit = entry.lines.reduce((s, l) => s + (l.credit || 0), 0);
  const canApprove = hasRole('FINANCE_MANAGER', 'FINANCE_DIRECTOR', 'SUPER_ADMIN') && entry.status === 'DRAFT' && entry.created_by !== user?.id;
  const canPost = hasRole('ACCOUNTANT', 'FINANCE_MANAGER', 'FINANCE_DIRECTOR', 'SUPER_ADMIN') && entry.status === 'DRAFT';
  const canReverse = hasRole('FINANCE_MANAGER', 'FINANCE_DIRECTOR', 'SUPER_ADMIN') && entry.status === 'POSTED';
  const canDelete = hasRole('ACCOUNTANT', 'FINANCE_MANAGER', 'FINANCE_DIRECTOR', 'SUPER_ADMIN') && entry.status === 'DRAFT';

  const act = async (fn: () => Promise<any>, msg: string) => {
    try {
      await fn();
      await load();
      notify('success', msg);
    } catch (err: any) {
      notify('error', 'Action failed', err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/journals" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 8 }} className="link-btn">
            <ArrowLeft size={13} /> Journal Entries
          </Link>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="code-pill">{entry.entry_number}</span>
            <Badge status={entry.status} />
            <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>{entry.source}</span>
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {entry.status === 'DRAFT' && canPost && (
            <button className="btn btn-primary" onClick={() => act(() => api.post(`/journals/${entry.id}/post`), 'Entry posted to ledger')}>
              <Check size={15} /> Post
            </button>
          )}
          {entry.status === 'DRAFT' && canApprove && (
            <button className="btn btn-teal" onClick={() => act(() => api.post(`/journals/${entry.id}/approve`), 'Entry approved')}>
              <Send size={15} /> Approve
            </button>
          )}
          {entry.status === 'POSTED' && canReverse && (
            <button className="btn btn-outline-danger" onClick={() => setShowReverse(true)}>
              <RotateCcw size={15} /> Reverse
            </button>
          )}
          {canDelete && (
            <button className="btn btn-danger" onClick={() => setShowDelete(true)}>
              <Trash2 size={15} /> Delete
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad">
          <div className="detail-list">
            <div className="detail-item">
              <div className="d-label">Entry date</div>
              <div className="d-value">{fmtDate(entry.entry_date)}</div>
            </div>
            <div className="detail-item">
              <div className="d-label">Fiscal year / period</div>
              <div className="d-value">{entry.fiscal_year} / {entry.period}</div>
            </div>
            <div className="detail-item">
              <div className="d-label">Created by</div>
              <div className="d-value">{entry.created_by_user || '—'} {entry.created_at ? <span className="muted" style={{ fontWeight: 400 }}>· {fmtDateTime(entry.created_at)}</span> : ''}</div>
            </div>
            <div className="detail-item">
              <div className="d-label">Approved by</div>
              <div className="d-value">{entry.approved_by_user || '—'}{entry.approved_at ? <span className="muted" style={{ fontWeight: 400 }}> · {fmtDateTime(entry.approved_at)}</span> : ''}</div>
            </div>
            <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
              <div className="d-label">Description</div>
              <div className="d-value">{entry.description}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Lines</div></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Department</th>
                <th>Description</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link to={`/accounts/${l.account_id}`} style={{ fontWeight: 600 }}>{l.account?.code}</Link>
                    <span className="muted"> · {l.account?.name}</span>
                  </td>
                  <td className="muted">{l.department_id ? 'Dept' : '—'}</td>
                  <td>{l.description || '—'}</td>
                  <td className="num">{l.debit ? fmtMoney(l.debit) : ''}</td>
                  <td className="num">{l.credit ? fmtMoney(l.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--surface-2)' }}>
                <td colSpan={3} style={{ fontWeight: 700 }}>Totals</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(debit)}</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(credit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <Modal open={showReverse} onClose={() => setShowReverse(false)} title="Reverse this entry?">
        <p style={{ color: 'var(--text-2)' }}>
          This will create a new reversing journal entry (opposite debits/credits) with status <Badge status="REVERSED" label="Reversed" /> on the original and a posted reversal entry. This is the standard correction method for posted entries.
        </p>
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={() => setShowReverse(false)}>Cancel</button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              try {
                const reversal = await api.post<{ id: string }>(`/journals/${entry.id}/reverse`);
                notify('success', 'Entry reversed', 'A reversing entry was posted');
                setShowReverse(false);
                navigate(`/journals/${reversal.id}`);
              } catch (err: any) {
                notify('error', 'Reversal failed', err.message);
              }
            }}
          >
            Create reversal
          </button>
        </div>
      </Modal>

      <Confirm
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={() => act(async () => { await api.del(`/journals/${entry.id}`); navigate('/journals'); }, 'Entry deleted')}
        title="Delete this entry?"
        message="Only draft entries can be deleted. This action cannot be undone."
        confirmText="Delete"
        danger
      />
    </div>
  );
}
