import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { buildApiUrl, isApiUrlConfigured } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { User } from '../types';

type ModalStep = 1 | 2;

export default function AdminSettingsPage() {
  const { session, profile } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [target, setTarget] = useState<User | null>(null);
  const [step, setStep] = useState<ModalStep>(1);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const loadUsers = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (qErr) {
      setError(qErr.message);
      setUsers([]);
    } else {
      setError('');
      setUsers((data as User[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  function openDelete(u: User) {
    setTarget(u);
    setStep(1);
    setPassword('');
    setModalError('');
  }

  function closeModal() {
    setTarget(null);
    setStep(1);
    setPassword('');
    setModalError('');
    setSubmitting(false);
  }

  async function confirmDelete() {
    if (!target || !session?.access_token) return;
    setModalError('');
    if (!password.trim()) {
      setModalError('Enter your admin password.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(buildApiUrl(`/api/users/${target.id}/delete`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ password }),
      });
      if (res.status === 204) {
        setToast(`Deleted ${target.email}`);
        window.setTimeout(() => setToast(''), 4000);
        closeModal();
        await loadUsers();
        return;
      }
      let detail = 'Could not delete user.';
      try {
        const body = (await res.json()) as { detail?: string | { msg?: string }[] };
        if (typeof body.detail === 'string') detail = body.detail;
        else if (Array.isArray(body.detail) && body.detail[0]?.msg) detail = body.detail[0].msg;
      } catch {
        /* ignore */
      }
      setModalError(detail);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  }

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

      <div className="mb-6">
        <h2 className="text-2xl font-black text-slate-800">Admin settings</h2>
        <p className="text-sm text-slate-500 mt-1">
          Remove user accounts permanently. You cannot delete your own account or other admin users. Engineers,
          inspectors, and DRRMO can be removed here.
        </p>
      </div>

      {!isApiUrlConfigured() && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Set <code className="font-mono">VITE_API_URL</code> in <code className="font-mono">web/.env</code> (same host as
          your FastAPI server, e.g. <code className="font-mono">http://localhost:8000</code>) and restart Vite so
          password-protected delete works.
        </div>
      )}

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3 bg-slate-50">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Delete user accounts</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wider bg-slate-50">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const isSelf = profile?.id === u.id;
              const isOtherAdmin = u.role?.toLowerCase() === 'admin';
              const canDelete = !isSelf && !isOtherAdmin;
              return (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800">{u.full_name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{u.email}</td>
                  <td className="px-4 py-3 text-sm capitalize text-slate-700">{u.role}</td>
                  <td className="px-4 py-3 text-sm capitalize text-slate-600">{u.verification_status ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {canDelete ? (
                      <button
                        type="button"
                        disabled={!isApiUrlConfigured()}
                        onClick={() => openDelete(u)}
                        className="text-xs font-bold px-3 py-1.5 rounded-md border border-red-600 text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Delete…
                      </button>
                    ) : (
                      <span
                        className="text-xs text-slate-400"
                        title={
                          isSelf
                            ? 'You cannot delete your own account here.'
                            : 'Other admin accounts cannot be deleted.'
                        }
                      >
                        —
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">No users found.</div>
        )}
      </div>

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-title"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200"
          >
            <h3 id="delete-user-title" className="text-lg font-bold text-slate-900">
              {step === 1 ? 'Confirm deletion' : 'Verify password'}
            </h3>

            {step === 1 ? (
              <>
                <p className="mt-3 text-sm text-slate-600">
                  Permanently delete <span className="font-semibold">{target.email}</span>? This removes their login and
                  profile. It cannot be undone. If they created assessments, deletion may be blocked until that data is
                  handled.
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-slate-600">
                  Enter <span className="font-semibold">your</span> admin account password to confirm deletion of{' '}
                  <span className="font-semibold">{target.email}</span>.
                </p>
                <label htmlFor="admin-delete-password" className="mt-4 block text-xs font-semibold text-slate-600">
                  Your password
                </label>
                <input
                  id="admin-delete-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                {modalError && <p className="mt-2 text-sm text-red-600">{modalError}</p>}
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setPassword('');
                      setModalError('');
                    }}
                    disabled={submitting}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void confirmDelete()}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:bg-red-400"
                  >
                    {submitting ? 'Deleting…' : 'Delete permanently'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
