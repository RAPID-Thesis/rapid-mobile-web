import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { buildApiUrl, isApiUrlConfigured } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { User } from '../types';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  RoleBadge,
  SkeletonRows,
  VerificationBadge,
} from '../components/ui';

type ModalStep = 1 | 2;

export default function AdminSettingsPage() {
  const { session, profile } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
        setNotice(`Deleted ${target.email}`);
        window.setTimeout(() => setNotice(''), 5000);
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
        /* response had no JSON body */
      }
      setModalError(detail);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (error && users.length === 0 && !loading) {
    return (
      <>
        <PageHeader title="Admin settings" />
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            void loadUsers();
          }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Admin settings"
        description="Permanently remove user accounts. You cannot delete your own account or another administrator."
      />

      <div className="space-y-3">
        {notice && <Alert tone="ok">{notice}</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}

        {!isApiUrlConfigured() && (
          <Alert tone="warn" title="Deletion is unavailable">
            Set <code className="font-mono">VITE_API_URL</code> in{' '}
            <code className="font-mono">web/.env</code> to your FastAPI host (for example{' '}
            <code className="font-mono">http://localhost:8000</code>) and restart Vite. Account
            deletion is password-protected and runs through the API, not directly against the
            database.
          </Alert>
        )}

        <Card>
          <CardHeader
            title="User accounts"
            description="Engineers, inspectors and DRRMO accounts can be removed here."
          />
          {loading ? (
            <SkeletonRows rows={6} />
          ) : users.length === 0 ? (
            <EmptyState title="No users found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <caption className="sr-only">User accounts available for deletion</caption>
                <thead>
                  <tr className="border-b border-line bg-surface-raised text-left text-2xs uppercase tracking-wider text-ink-subtle">
                    <th scope="col" className="px-4 py-2 font-medium">Name</th>
                    <th scope="col" className="px-4 py-2 font-medium">Email</th>
                    <th scope="col" className="px-4 py-2 font-medium">Role</th>
                    <th scope="col" className="px-4 py-2 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {users.map((u) => {
                    const isSelf = profile?.id === u.id;
                    const isOtherAdmin = u.role?.toLowerCase() === 'admin';
                    const canDelete = !isSelf && !isOtherAdmin;
                    return (
                      <tr key={u.id} className="transition-colors hover:bg-surface-raised">
                        <td className="px-4 py-2.5 font-medium text-ink">{u.full_name || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-ink-muted">{u.email}</td>
                        <td className="px-4 py-2.5">
                          <RoleBadge role={u.role} />
                        </td>
                        <td className="px-4 py-2.5">
                          <VerificationBadge status={u.verification_status ?? 'approved'} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {canDelete ? (
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={!isApiUrlConfigured()}
                              onClick={() => openDelete(u)}
                            >
                              Delete…
                            </Button>
                          ) : (
                            <span
                              className="text-2xs text-ink-subtle"
                              title={
                                isSelf
                                  ? 'You cannot delete your own account here.'
                                  : 'Other administrator accounts cannot be deleted.'
                              }
                            >
                              {isSelf ? 'Your account' : 'Protected'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Two-step confirmation, now on the shared Modal so it traps focus,
          closes on Escape and restores focus on close — none of which the
          hand-rolled overlay did. */}
      <Modal
        open={Boolean(target)}
        onClose={closeModal}
        title={step === 1 ? 'Delete this account?' : 'Confirm with your password'}
        size="sm"
        footer={
          step === 1 ? (
            <>
              <Button variant="secondary" onClick={closeModal}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setStep(2)}>
                Continue
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                disabled={submitting}
                onClick={() => {
                  setStep(1);
                  setPassword('');
                  setModalError('');
                }}
              >
                Back
              </Button>
              <Button variant="danger" loading={submitting} onClick={() => void confirmDelete()}>
                {submitting ? 'Deleting…' : 'Delete permanently'}
              </Button>
            </>
          )
        }
      >
        {target && step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              This permanently removes the login and profile for{' '}
              <span className="font-medium text-ink">{target.email}</span>. It cannot be undone.
            </p>
            <Alert tone="warn">
              If this user has recorded assessments, deletion may be refused until those records are
              reassigned.
            </Alert>
          </div>
        )}

        {target && step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Enter <span className="font-medium text-ink">your own</span> administrator password to
              delete <span className="font-medium text-ink">{target.email}</span>.
            </p>
            <Field label="Your password" required error={modalError || null}>
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  invalid={Boolean(modalError)}
                />
              )}
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
