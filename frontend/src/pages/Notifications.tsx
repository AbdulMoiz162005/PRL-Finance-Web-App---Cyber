import { useEffect, useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Badge, EmptyState, LoadingBlock } from '../components/ui';
import type { Notification } from '../api/types';
import { fmtDateTime } from '../lib/format';

export default function Notifications() {
  const { hasRole } = useAuth();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setNotifs(await api.get<Notification[]>('/notifications'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markRead = async (id: string) => {
    await api.post(`/notifications/${id}/read`);
    load();
  };

  const markAll = async () => {
    await api.post('/notifications/read-all');
    load();
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Notifications"
        sub={`${notifs.filter((n) => !n.is_read).length} unread`}
        actions={
          notifs.length > 0 ? (
            <button className="btn btn-secondary" onClick={markAll}>
              <CheckCheck size={15} /> Mark all read
            </button>
          ) : undefined
        }
      />

      <div className="card">
        {notifs.length === 0 ? (
          <EmptyState title="No notifications" />
        ) : (
          notifs.map((n) => (
            <div
              key={n.id}
              className={`notif-item ${n.is_read ? '' : 'unread'}`}
              onClick={() => !n.is_read && markRead(n.id)}
              style={{ cursor: n.is_read ? 'default' : 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="n-title">{n.title}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Badge status={n.is_read ? 'DISABLED' : 'ACTIVE'} label={n.is_read ? 'Read' : 'Unread'} />
                  <span className="n-time">{fmtDateTime(n.created_at)}</span>
                </div>
              </div>
              {n.message && <div className="n-msg">{n.message}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
