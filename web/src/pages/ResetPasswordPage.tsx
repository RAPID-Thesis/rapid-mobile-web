import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Alert, Button, Field, Input, Skeleton } from '../components/ui';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [initError, setInitError] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const href = window.location.href;
        const url = new URL(href);
        const tokenHash = url.searchParams.get('token_hash');
        const otpType = (url.searchParams.get('type') ?? 'recovery') as EmailOtpType;

        if (tokenHash) {
          // Preferred path. verifyOtp carries no client-side state: the hash in the
          // link is itself the credential, so the reset works in any browser, on any
          // device, even if the request was made somewhere else entirely.
          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });
          if (otpError) {
            if (!cancelled) setInitError(otpError.message);
            if (!cancelled) setChecking(false);
            return;
          }
          // Drop the single-use token from the address bar and browser history.
          window.history.replaceState({}, document.title, url.pathname);
        } else if (url.searchParams.get('code')) {
          // Legacy PKCE path, kept so links already sitting in inboxes still work.
          // It requires the code_verifier stored when the reset was requested, so it
          // only succeeds in the same browser and origin that requested it.
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(href);
          if (exchangeError) {
            if (!cancelled) {
              setInitError(
                exchangeError.message.includes('code verifier')
                  ? 'This link was opened on a different device or browser than the one that ' +
                    'requested it. Request a new link and it will work anywhere.'
                  : exchangeError.message,
              );
              setChecking(false);
            }
            return;
          }
          window.history.replaceState({}, document.title, `${url.pathname}${url.hash}`);
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session) {
          setSessionReady(true);
        } else {
          setInitError(
            'This reset link is invalid or has expired. Request a new one from the sign-in page.',
          );
        }
      } catch {
        if (!cancelled) {
          setInitError('Could not validate your reset link. Please try again from your email.');
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        setSessionReady(true);
        setInitError('');
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      navigate('/login', {
        replace: true,
        state: {
          message: 'Your password was updated. Sign in with your new password.',
          flashType: 'success',
        },
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not update password. Try again or request a new link.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <AuthLayout title="Checking your link" description="One moment.">
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      </AuthLayout>
    );
  }

  if (!sessionReady) {
    return (
      <AuthLayout
        title="This link isn't valid"
        footer={
          <Link to="/login" className="font-medium text-brand-700 hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="space-y-4">
          <Alert tone="danger">{initError}</Alert>
          <Link to="/forgot-password" className="block">
            <Button variant="primary" fullWidth>
              Request a new link
            </Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      description="You'll be signed out and asked to sign in with the new password."
      footer={
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}

        <Field label="New password" required hint="At least 8 characters.">
          {(props) => (
            <Input
              {...props}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              invalid={Boolean(error)}
              autoFocus
            />
          )}
        </Field>

        <Field label="Confirm new password" required>
          {(props) => (
            <Input
              {...props}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              invalid={Boolean(error)}
            />
          )}
        </Field>

        <Button type="submit" variant="primary" fullWidth loading={submitting}>
          {submitting ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
