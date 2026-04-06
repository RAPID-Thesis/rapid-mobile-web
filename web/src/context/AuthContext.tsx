import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'engineer' | 'drrmo' | 'inspector';
  lgu_code: string;
  avatar_url: string | null;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    meta: { full_name: string; role: string; lgu_code: string }
  ) => Promise<void>;
  signOut: () => Promise<void>;
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

/** Never block auth UI on profile fetch — avoids endless spinner if DB hangs or RLS fails. */
function finishAuthBootstrap(
  s: Session | null,
  setters: {
    setSession: (v: Session | null) => void;
    setUser: (v: User | null) => void;
    setProfile: (v: UserProfile | null) => void;
    setLoading: (v: boolean) => void;
  },
  cancelled: () => boolean
) {
  setters.setSession(s);
  setters.setUser(s?.user ?? null);
  if (!s?.user) {
    setters.setProfile(null);
    if (!cancelled()) setters.setLoading(false);
    return;
  }
  if (!cancelled()) setters.setLoading(false);
  void fetchProfile(s.user.id).then((p) => {
    if (!cancelled()) setters.setProfile(p);
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        if (cancelled) return;
        finishAuthBootstrap(s, { setSession, setUser, setProfile, setLoading }, isCancelled);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      finishAuthBootstrap(s, { setSession, setUser, setProfile, setLoading }, isCancelled);
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (
    email: string,
    password: string,
    meta: { full_name: string; role: string; lgu_code: string }
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: meta },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, signIn, signUp, signOut }}
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
