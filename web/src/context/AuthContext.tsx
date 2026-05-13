/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isWebPasswordResetRoute } from '../lib/authRecovery';
import { supabase } from '../lib/supabase';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'engineer' | 'drrmo' | 'inspector';
  lgu_code: string;
  avatar_url: string | null;
  verification_status?: 'pending' | 'approved' | 'rejected' | null;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    meta: { full_name: string; role: string; lgu_code: string }
  ) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) return null;
    return data as UserProfile;
  } catch {
    return null;
  }
}

/**
 * Backward-compatible approval check. If the `verification_status` column has
 * not been added yet (e.g., older database without the migration), treat the
 * account as approved so existing users aren't accidentally locked out.
 */
export function isApprovedProfile(profile: UserProfile | null): boolean {
  if (!profile) return false;
  const status = profile.verification_status;
  if (status === undefined || status === null) return true;
  return status === 'approved';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const passwordRecoveryRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const handleSession = (s: Session | null) => {
      setSession(s);
      setUser(s?.user ?? null);

      if (!s?.user) {
        setProfile(null);
        setProfileLoading(false);
        if (!cancelled) setLoading(false);
        return;
      }

      setProfileLoading(true);
      if (!cancelled) setLoading(false);

      void fetchProfile(s.user.id).then((p) => {
        if (cancelled) return;
        setProfile(p);
        setProfileLoading(false);

        const allowPendingDuringReset =
          passwordRecoveryRef.current || isWebPasswordResetRoute();

        if (p && !isApprovedProfile(p) && !allowPendingDuringReset) {
          void supabase.auth.signOut().then(() => {
            if (cancelled) return;
            setSession(null);
            setUser(null);
            setProfile(null);
          });
        }
      });
    };

    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        if (cancelled) return;
        handleSession(s);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') {
        passwordRecoveryRef.current = true;
      }
      if (event === 'SIGNED_OUT') {
        passwordRecoveryRef.current = false;
      }
      handleSession(s);
    });

    const failSafe = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 12_000);

    return () => {
      cancelled = true;
      window.clearTimeout(failSafe);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    if (!data.user) throw new Error('Unable to sign in right now.');

    const fetched = await fetchProfile(data.user.id);
    if (!isApprovedProfile(fetched)) {
      await supabase.auth.signOut();
      throw new Error('Your account is still pending admin approval.');
    }
  };

  const signUp = async (
    email: string,
    password: string,
    meta: { full_name: string; role: string; lgu_code: string }
  ) => {
    const normalizedEmail = email.trim();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: { data: meta },
    });
    if (error) throw error;

    // Defensive: ensure the profile row exists even if the DB trigger isn't installed
    // or it failed silently. RLS allows users to insert their own row (id = auth.uid()).
    const userId = data.user?.id;
    if (userId) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: userId,
            email: normalizedEmail,
            full_name: meta.full_name,
            role: meta.role,
            lgu_code: meta.lgu_code,
            verification_status: 'pending',
          },
          { onConflict: 'id', ignoreDuplicates: true }
        );
      if (profileError) {
        console.warn('Profile upsert after signup failed:', profileError.message);
      }
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  const requestPasswordReset = async (email: string) => {
    const normalized = email.trim();
    const site =
      (import.meta.env.VITE_SITE_URL as string | undefined)?.trim() || window.location.origin;
    const redirectTo = `${site.replace(/\/$/, '')}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(normalized, { redirectTo });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading,
        profileLoading,
        signIn,
        signUp,
        signOut,
        requestPasswordReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
