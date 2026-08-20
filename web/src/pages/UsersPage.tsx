import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { User, VerificationStatus } from '../types';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  RoleBadge,
  SkeletonRows,
  VerificationBadge,
} from '../components/ui';
import { UsersIcon } from '../components/ui/icons';

function statusLabel(status?: VerificationStatus | null): VerificationStatus {
  if (status === undefined || status === null) return 'approved';
  return status;
}

function initialsOf(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
    [users],
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

      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, verification_status: next } : u)));
      setNotice(next === 'approved' ? 'User approved.' : 'User rejected.');
      window.setTimeout(() => setNotice(''), 4000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to update user verification.';
      setError(message);
    } finally {
      setBusyId(null);
    }
  };

  // A hard load failure means the table below would be empty and misleading.
  if (error && users.length === 0 && !loading) {
    return (
      <>
        <PageHeader title="Users" />
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
        title="Users"
        description="Approve sign-up requests and review existing accounts."
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setLoading(true);
              void loadUsers();
            }}
          >
            Refresh
          </Button>
        }
      />

      <div className="space-y-3">
        {notice && <Alert tone="ok">{notice}</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}

        {/* Pending approvals lead: it is the only part of this page with an
            action attached, and accounts sit unusable until it happens. */}
        <Card>
          <CardHeader
            title={`Pending approvals (${pendingUsers.length})`}
            description="New accounts cannot sign in until approved."
          />
          {loading ? (
            <SkeletonRows rows={2} />
          ) : pendingUsers.length === 0 ? (
            <EmptyState title="Nothing waiting" description="No sign-up requests need a decision." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">Accounts awaiting approval</caption>
                <thead>
                  <tr className="border-b border-line bg-warn-bg text-left text-2xs uppercase tracking-wider text-restricted">
                    <th scope="col" className="px-4 py-2 font-medium">Name</th>
                    <th scope="col" className="px-4 py-2 font-medium">Email</th>
                    <th scope="col" className="px-4 py-2 font-medium">Requested role</th>
                    <th scope="col" className="px-4 py-2 font-medium">Submitted</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pendingUsers.map((user) => (
                    <tr key={user.id} className="transition-colors hover:bg-surface-raised">
                      <td className="px-4 py-2.5 font-medium text-ink">{user.full_name || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-ink-muted">{user.email}</td>
                      <td className="px-4 py-2.5">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="tabular px-4 py-2.5 text-2xs text-ink-subtle">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            loading={busyId === user.id}
                            onClick={() => void updateStatus(user.id, 'approved')}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busyId === user.id}
                            onClick={() => void updateStatus(user.id, 'rejected')}
                          >
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title={`All users (${users.length})`}
            description={
              <>
                To permanently remove an approved user, use{' '}
                <Link to="/admin/settings" className="font-medium text-brand-700 hover:underline">
                  Admin settings
                </Link>
                .
              </>
            }
          />
          {loading ? (
            <SkeletonRows rows={6} />
          ) : users.length === 0 ? (
            <EmptyState
              icon={<UsersIcon className="h-8 w-8" />}
              title="No users yet"
              description="Accounts appear here once people register through the portal or mobile app."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">All registered users</caption>
                <thead>
                  <tr className="border-b border-line bg-surface-raised text-left text-2xs uppercase tracking-wider text-ink-subtle">
                    <th scope="col" className="px-4 py-2 font-medium">Name</th>
                    <th scope="col" className="px-4 py-2 font-medium">Email</th>
                    <th scope="col" className="px-4 py-2 font-medium">Role</th>
                    <th scope="col" className="px-4 py-2 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2 font-medium">LGU</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {users.map((user) => (
                    <tr key={user.id} className="transition-colors hover:bg-surface-raised">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-2xs font-semibold text-brand-700"
                          >
                            {initialsOf(user.full_name)}
                          </span>
                          <span className="font-medium text-ink">{user.full_name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink-muted">{user.email}</td>
                      <td className="px-4 py-2.5">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="px-4 py-2.5">
                        <VerificationBadge status={statusLabel(user.verification_status)} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink-muted">{user.lgu_code || '—'}</td>
                      <td className="tabular px-4 py-2.5 text-right text-2xs text-ink-subtle">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
