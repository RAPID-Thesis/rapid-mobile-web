import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
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

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (!data) return null;
  return data as UserProfile;
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

        if (p && !isApprovedProfile(p)) {
          void supabase.auth.signOut().then(() => {
            if (cancelled) return;
            setSession(null);
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
