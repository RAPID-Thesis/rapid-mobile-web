import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User, VerificationStatus } from '../types';

function getRoleBadge(role: string) {
  switch (role) {
    case 'admin': return 'bg-purple-100 text-purple-700';
    case 'engineer': return 'bg-blue-100 text-blue-700';
    case 'drrmo': return 'bg-teal-100 text-teal-700';
    case 'inspector': return 'bg-slate-100 text-slate-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

function getStatusBadge(status?: VerificationStatus | null) {
  switch (status) {
    case 'pending': return 'bg-amber-100 text-amber-700';
    case 'rejected': return 'bg-red-100 text-red-700';
    case 'approved':
    default:
      return 'bg-emerald-100 text-emerald-700';
  }
}

function statusLabel(status?: VerificationStatus | null) {
  if (status === undefined || status === null) return 'approved';
  return status;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const loadUsers = async () => {
    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
    } else {
      setError('');
      setUsers((data as User[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const pendingUsers = useMemo(
    () => users.filter((u) => u.verification_status === 'pending'),
    [users]
  );

  const updateStatus = async (userId: string, next: VerificationStatus) => {
    setBusyId(userId);
    setError('');
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ verification_status: next })
        .eq('id', userId);
      if (updateError) throw updateError;

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, verification_status: next } : u))
      );
      setToast(
        next === 'approved'
          ? 'User approved.'
          : next === 'rejected'
          ? 'User rejected.'
          : 'User updated.'
      );
      window.setTimeout(() => setToast(''), 3000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to update user verification.';
      setError(message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-50 max-w-sm rounded-lg bg-emerald-600 text-white px-4 py-3 shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black text-slate-800">User Management</h2>
          <p className="text-sm text-slate-500 mt-1">
            Approve or reject pending sign-up requests and review existing users.
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            void loadUsers();
          }}
          className="text-sm font-semibold px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
      )}

      <section className="mb-8">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
          Pending Approvals ({pendingUsers.length})
        </h3>
        <div className="bg-white rounded-xl overflow-hidden border border-amber-200 shadow-sm">
          {pendingUsers.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <p className="text-sm">No pending sign-up requests.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider bg-amber-50">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Requested Role</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-sm text-slate-800">
                      {user.full_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold capitalize ${getRoleBadge(user.role)}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          disabled={busyId === user.id}
                          onClick={() => void updateStatus(user.id, 'approved')}
                          className="text-xs font-bold px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {busyId === user.id ? '...' : 'Approve'}
                        </button>
                        <button
                          disabled={busyId === user.id}
                          onClick={() => void updateStatus(user.id, 'rejected')}
                          className="text-xs font-bold px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
          All Users
        </h3>
        <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wider bg-slate-50">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">LGU Code</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => {
                const status = statusLabel(user.verification_status);
                return (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">
                          {user.full_name
                            ? user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2)
                            : '?'}
                        </div>
                        <span className="font-semibold text-sm text-slate-800">{user.full_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold capitalize ${getRoleBadge(user.role)}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold capitalize ${getStatusBadge(user.verification_status)}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{user.lgu_code || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        {user.verification_status !== 'approved' && (
                          <button
                            disabled={busyId === user.id}
                            onClick={() => void updateStatus(user.id, 'approved')}
                            className="text-xs font-bold px-2.5 py-1 rounded-md border border-emerald-600 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                          >
                            Approve
                          </button>
                        )}
                        {user.verification_status !== 'rejected' && (
                          <button
                            disabled={busyId === user.id}
                            onClick={() => void updateStatus(user.id, 'rejected')}
                            className="text-xs font-bold px-2.5 py-1 rounded-md border border-red-600 text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <p className="text-lg font-semibold mb-1">No users found</p>
              <p className="text-sm">Users will appear here once they register.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
