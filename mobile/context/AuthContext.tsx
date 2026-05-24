import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getPasswordRecoveryBypass } from '../services/passwordRecovery';
import { supabase } from '../services/supabase';
import type { UserProfile } from '../services/auth';

interface AuthState {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  try {
    const { data } = await withTimeout(
      supabase.from('profiles').select('*').eq('id', userId).single(),
      8000,
      { data: null, error: null },
    );
    if (!data) return null;
    return data as UserProfile;
  } catch {
    return null;
  }
}

/**
 * Backward-compatible approval check. If the verification_status column has
 * not been added yet, treat the account as approved so existing users aren't
 * accidentally locked out.
 */
export function isApprovedProfile(profile: UserProfile | null): boolean {
  if (!profile) return false;
  const status = profile.verification_status;
  if (status === undefined || status === null) return true;
  return status === 'approved';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const handleSession = (s: Session | null) => {
      setSession(s);
      if (!s?.user) {
        setProfile(null);
        setProfileLoading(false);
        setLoading(false);
        return;
      }

      setProfileLoading(true);
      setLoading(false);

      void fetchProfile(s.user.id).then((p) => {
        if (cancelled) return;
        setProfile(p);
        setProfileLoading(false);

        if (p && !isApprovedProfile(p) && !getPasswordRecoveryBypass()) {
          void supabase.auth.signOut().then(() => {
            if (cancelled) return;
            setSession(null);
            setProfile(null);
          });
        }
      });
    };

    void withTimeout(supabase.auth.getSession(), 8000, { data: { session: null }, error: null })
      .then(({ data: { session: s } }) => {
        if (cancelled) return;
        handleSession(s);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      handleSession(s);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, profileLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
