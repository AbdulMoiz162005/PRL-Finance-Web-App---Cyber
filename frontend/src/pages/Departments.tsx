import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { PageHeader, Modal, Badge, EmptyState, LoadingBlock } from '../components/ui';
import type { Department, User } from '../api/types';

export default function Departments() {
  const { hasRole } = useAuth();
  const { notify } = useToast();
  const [depts, setDepts] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<Department | null>(null);

  const canManage = hasRole('SUPER_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_MANAGER');

  const load = async () => {
    setLoading(true);
    try {
      const [d, u] = await Promise.all([api.get<Department[]>('/departments'), api.get<User[]>('/users')]);
      setDepts(d);
      setUsers(u);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Departments"
        sub={`${depts.length} departments`}
        actions={
          canManage && (
            <button className="btn btn-primary" onClick={() => { setEdit(null); setShowForm(true); }}>
              <Plus size={15} /> New department
            </button>
          )
        }
      />

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Description</th>
                <th>Head</th>
                <th>Status</th>
                <th className="actions"></th>
              </tr>
            </thead>
            <tbody>
              {depts.map((d) => (
                <tr key={d.id}>
                  <td><span className="code-pill">{d.code}</span></td>
                  <td style={{ fontWeight: 600 }}>{d.name}</td>
                  <td className="muted">{d.description || '—'}</td>
                  <td className="muted">{d.head || '—'}</td>
                  <td>{d.is_active ? <Badge status="ACTIVE" label="Active" /> : <Badge status="DISABLED" label="Inactive" />}</td>
                  <td className="actions">
                    {canManage && (
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEdit(d); setShowForm(true); }}><Pencil size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {depts.length === 0 && <EmptyState title="No departments" />}
      </div>

      <DeptForm open={showForm} onClose={() => setShowForm(false)} dept={edit} users={users} onSaved={() => { setShowForm(false); load(); }} />
    </div>
  );
}

function DeptForm({ open, onClose, dept, users, onSaved }: { open: boolean; onClose: () => void; dept: Department | null; users: User[]; onSaved: () => void }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({ code: '', name: '', description: '', head_user_id: '', is_active: true });

  useEffect(() => {
    if (open) {
      setForm({
        code: dept?.code || '', name: dept?.name || '', description: dept?.description || '',
        head_user_id: dept?.head_user_id || '', is_active: dept?.is_active ?? true,
      });
    }
  }, [open, dept]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (dept) {
        await api.put(`/departments/${dept.id}`, {
          name: form.name,
          description: form.description || null,
          head_user_id: form.head_user_id || null,
          is_active: form.is_active,
        });
      } else {
        await api.post('/departments', {
          code: form.code,
          name: form.name,
          description: form.description || null,
          head_user_id: form.head_user_id || null,
        });
      }
      onSaved();
    } catch (err: any) {
      notify('error', 'Failed to save department', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={dept ? `Edit ${dept.name}` : 'New department'}>
      <form onSubmit={submit}>
        <div className="form-grid">
          {!dept && (
            <div className="field">
              <label>Code <span className="req">*</span></label>
              <input className="input" value={form.code} onChange={(e) => setForm((f: any) => ({ ...f, code: e.target.value }))} placeholder="e.g. OPS" maxLength={10} required />
            </div>
          )}
          <div className="field">
            <label>Name <span className="req">*</span></label>
            <input className="input" value={form.name} onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Head of department</label>
            <select className="select" value={form.head_user_id} onChange={(e) => setForm((f: any) => ({ ...f, head_user_id: e.target.value }))}>
              <option value="">—</option>
              {users.filter((u) => u.status === 'ACTIVE').map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Description</label>
            <textarea className="textarea" value={form.description} onChange={(e) => setForm((f: any) => ({ ...f, description: e.target.value }))} />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : dept ? 'Save changes' : 'Create department'}</button>
        </div>
      </form>
    </Modal>
  );
}
