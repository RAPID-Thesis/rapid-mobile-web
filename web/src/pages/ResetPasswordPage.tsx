import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

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
        if (url.searchParams.get('code')) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(href);
          if (exchangeError) {
            if (!cancelled) setInitError(exchangeError.message);
            if (!cancelled) setChecking(false);
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
        err instanceof Error ? err.message : 'Could not update password. Try again or request a new link.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-3">Link problem</h2>
          <p className="text-sm text-slate-600 mb-6">{initError}</p>
          <Link
            to="/forgot-password"
            className="inline-block w-full text-center h-12 leading-[3rem] bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700"
          >
            Request a new link
          </Link>
          <p className="text-center mt-4">
            <Link to="/login" className="text-sm font-semibold text-blue-600 hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500 text-white text-3xl font-black mb-4">
            R
          </div>
          <h1 className="text-3xl font-black text-white tracking-wider">RAPID</h1>
          <p className="text-blue-300 text-sm mt-1">Choose a new password</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-6">Set new password</h2>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-semibold text-slate-700 mb-1">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full h-12 px-4 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Repeat password"
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-lg transition-colors"
          >
            {submitting ? 'Saving…' : 'Update password'}
          </button>

          <p className="text-center text-sm text-slate-600 mt-6">
            <Link to="/login" className="font-semibold text-blue-600 hover:underline">
              Cancel and return to sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
