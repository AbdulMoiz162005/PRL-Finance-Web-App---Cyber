import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpenText,
  Receipt,
  Wallet,
  Building2,
  Users,
  Landmark,
  PiggyBank,
  Boxes,
  ShieldCheck,
  Settings,
  ScrollText,
  Bell,
  LogOut,
  ChevronDown,
  BarChart3,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { ROLE_LABEL, type Notification } from '../api/types';
import { initials, fmtDateTime } from '../lib/format';
import { useToast } from '../components/Toast';

type NavItem =
  | { section: string }
  | { to: string; label: string; icon: LucideIcon; end?: boolean };

const NAV: NavItem[] = [
  { section: 'Overview' },
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { section: 'Accounting' },
  { to: '/journals', label: 'Journal Entries', icon: BookOpenText },
  { to: '/accounts', label: 'Chart of Accounts', icon: ListChecks },
  { to: '/trial-balance', label: 'Trial Balance', icon: ScrollText },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { section: 'Payables & Receivables' },
  { to: '/invoices', label: 'Invoices', icon: Receipt },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/vendors', label: 'Vendors', icon: Building2 },
  { to: '/customers', label: 'Customers', icon: Users },
  { section: 'Banking & Treasury' },
  { to: '/bank-accounts', label: 'Bank Accounts', icon: Landmark },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/petty-cash', label: 'Petty Cash', icon: Wallet },
  { to: '/assets', label: 'Fixed Assets', icon: Boxes },
  { section: 'Administration' },
  { to: '/users', label: 'Users & Roles', icon: ShieldCheck },
  { to: '/departments', label: 'Departments', icon: Building2 },
  { to: '/audit-logs', label: 'Audit Logs', icon: ScrollText },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/journals': 'Journal Entries',
  '/journals/new': 'New Journal Entry',
  '/accounts': 'Chart of Accounts',
  '/trial-balance': 'Trial Balance',
  '/reports': 'Financial Reports',
  '/invoices': 'Invoices',
  '/payments': 'Payments',
  '/vendors': 'Vendors',
  '/customers': 'Customers',
  '/bank-accounts': 'Bank Accounts',
  '/budgets': 'Budgets',
  '/petty-cash': 'Petty Cash',
  '/assets': 'Fixed Assets',
  '/users': 'Users & Roles',
  '/departments': 'Departments',
  '/audit-logs': 'Audit Logs',
  '/notifications': 'Notifications',
  '/settings': 'Settings',
};

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useToast();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<Notification[]>('/notifications').then(setNotifs).catch(() => {});
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setShowNotif(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const unread = notifs.filter((n) => !n.is_read).length;

  const visibleNav = NAV.filter((item) => {
    if (!hasRole) return false;
    if (!user) return false;
    if ('to' in item && item.label === 'Users & Roles' && !hasRole('SUPER_ADMIN', 'FINANCE_DIRECTOR')) return false;
    if ('to' in item && item.label === 'Audit Logs' && !hasRole('SUPER_ADMIN', 'FINANCE_DIRECTOR', 'AUDITOR', 'FINANCE_MANAGER')) return false;
    if ('to' in item && item.label === 'Departments' && !hasRole('SUPER_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_MANAGER')) return false;
    if ('to' in item && item.label === 'Settings' && !hasRole('SUPER_ADMIN')) return false;
    if ('to' in item && item.label === 'Fixed Assets' && hasRole('CASHIER', 'VIEWER')) return false;
    if ('to' in item && item.label === 'Budgets' && hasRole('CASHIER', 'VIEWER')) return false;
    return true;
  });

  const basePath = location.pathname.split('/').slice(0, 2).join('/');
  const title = PAGE_TITLES[location.pathname] || PAGE_TITLES[basePath] || 'Refinery Finance';

  const markRead = async () => {
    await api.post('/notifications/read-all');
    setNotifs((n) => n.map((x) => ({ ...x, is_read: true })));
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo">RF</div>
          <div>
            <div className="brand-name">Refinery Terminal</div>
            <div className="brand-sub">Finance & ERP</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {visibleNav.map((item, i) =>
            'section' in item ? (
              <div key={i} className="nav-section">
                {item.section}
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <item.icon />
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
        <div className="sidebar-footer">Refinery Terminal · FY {(new Date().getFullYear())}</div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="topbar-title">{title}</div>
          <div className="topbar-actions">
            <div ref={menuRef} style={{ position: 'relative' }}>
              <div className="bell" onClick={() => setShowNotif((v) => !v)}>
                <Bell size={19} />
                {unread > 0 && <span className="dot">{unread}</span>}
              </div>
              {showNotif && (
                <div className="notif-pop">
                  <div className="notif-header">
                    <span>Notifications</span>
                    {unread > 0 && (
                      <button className="link-btn" onClick={markRead}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifs.length === 0 && <div className="empty" style={{ padding: 24 }}>No notifications</div>}
                  {notifs.slice(0, 20).map((n) => (
                    <div
                      key={n.id}
                      className={`notif-item ${n.is_read ? '' : 'unread'}`}
                      onClick={() => {
                        setShowNotif(false);
                        navigate('/notifications');
                      }}
                    >
                      <div className="n-title">{n.title}</div>
                      <div className="n-msg">{n.message}</div>
                      <div className="n-time">{fmtDateTime(n.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div ref={menuRef} style={{ position: 'relative' }}>
              <div className="user-chip" onClick={() => setShowMenu((v) => !v)}>
                <div className="avatar">{user ? initials(user.full_name) : '?'}</div>
                <div>
                  <div className="u-name">{user?.full_name}</div>
                  <div className="u-role">{user ? ROLE_LABEL[user.role] : ''}</div>
                </div>
                <ChevronDown size={14} style={{ color: 'var(--text-3)' }} />
              </div>
              {showMenu && (
                <div className="user-menu">
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{user?.full_name}</div>
                    <div style={{ color: 'var(--text-3)', fontSize: 12 }}>{user?.email}</div>
                  </div>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      notify('info', 'Signed out');
                      logout();
                    }}
                    className="danger"
                  >
                    <LogOut size={14} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
