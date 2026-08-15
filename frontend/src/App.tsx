import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { LoadingBlock } from './components/ui';
import Layout from './layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import AccountDetail from './pages/AccountDetail';
import JournalList from './pages/JournalList';
import JournalNew from './pages/JournalNew';
import JournalDetail from './pages/JournalDetail';
import TrialBalance from './pages/TrialBalance';
import Reports from './pages/Reports';
import Invoices from './pages/Invoices';
import Payments from './pages/Payments';
import Vendors from './pages/Vendors';
import Customers from './pages/Customers';
import BankAccounts from './pages/BankAccounts';
import Budgets from './pages/Budgets';
import PettyCash from './pages/PettyCash';
import Assets from './pages/Assets';
import Users from './pages/Users';
import Departments from './pages/Departments';
import AuditLogs from './pages/AuditLogs';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingBlock />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Guard>
            <Layout />
          </Guard>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="accounts/:id" element={<AccountDetail />} />
        <Route path="journals" element={<JournalList />} />
        <Route path="journals/new" element={<JournalNew />} />
        <Route path="journals/:id" element={<JournalDetail />} />
        <Route path="trial-balance" element={<TrialBalance />} />
        <Route path="reports" element={<Reports />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="payments" element={<Payments />} />
        <Route path="vendors" element={<Vendors />} />
        <Route path="customers" element={<Customers />} />
        <Route path="bank-accounts" element={<BankAccounts />} />
        <Route path="budgets" element={<Budgets />} />
        <Route path="petty-cash" element={<PettyCash />} />
        <Route path="assets" element={<Assets />} />
        <Route path="users" element={<Users />} />
        <Route path="departments" element={<Departments />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
