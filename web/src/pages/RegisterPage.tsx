import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Alert, Button, Field, Input, Select } from '../components/ui';

const successMessage = 'Account submitted. An administrator will review it before you can sign in.';

type RoleOption = 'inspector' | 'admin' | 'engineer';

const ROLE_HINT: Record<RoleOption, string> = {
  inspector: 'Captures assessments in the field using the mobile app.',
  engineer: 'Reviews AI classifications and issues the official screening record.',
  admin: 'Manages accounts and system settings.',
};

export default function RegisterPage() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<RoleOption>('inspector');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => Boolean(name.trim()) && Boolean(email.trim()) && Boolean(password),
    [name, email, password],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setError('Complete all required fields.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      await signUp(email.trim(), password, {
        full_name: name.trim(),
        role,
        lgu_code: '',
      });
      // Previously a toast that vanished after 5s — easy to miss, and it left the
      // form looking as though nothing had happened. The confirmation now replaces
      // the form and stays put.
      setSubmitted(true);
      setName('');
      setEmail('');
      setPassword('');
      setRole('inspector');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to submit registration right now.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Request access"
      description="New accounts are reviewed by an administrator before they can sign in."
      footer={
        <p className="text-ink-subtle">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      {submitted ? (
        <Alert tone="ok" title="Request submitted">
          {successMessage}
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && <Alert tone="danger">{error}</Alert>}

          <Field label="Full name" required>
            {(props) => (
              <Input
                {...props}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Juan dela Cruz"
                autoComplete="name"
                autoFocus
              />
            )}
          </Field>

          <Field label="Email" required>
            {(props) => (
              <Input
                {...props}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@lgu.gov.ph"
                autoComplete="email"
              />
            )}
          </Field>

          <Field label="Password" required hint="At least 8 characters.">
            {(props) => (
              <Input
                {...props}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose a password"
                autoComplete="new-password"
              />
            )}
          </Field>

          <Field label="Role" required hint={ROLE_HINT[role]}>
            {(props) => (
              <Select {...props} value={role} onChange={(e) => setRole(e.target.value as RoleOption)}>
                <option value="inspector">Field inspector</option>
                <option value="engineer">Engineer</option>
                <option value="admin">Administrator</option>
              </Select>
            )}
          </Field>

          <Button type="submit" variant="primary" fullWidth loading={submitting} disabled={!canSubmit}>
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
