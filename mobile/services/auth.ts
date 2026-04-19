import { supabase } from './supabase';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'engineer' | 'drrmo' | 'inspector';
  lgu_code: string;
  avatar_url: string | null;
}

export interface LoginResponse {
  access_token: string;
  user: UserProfile;
}

export async function loginUser(
  email: string,
  password: string
): Promise<LoginResponse> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const msg = error.message ?? String(error);
    if (/network request failed/i.test(msg)) {
      throw new Error(
        'Cannot reach Supabase (network). Check: phone/emulator has internet; ' +
          'if you use mobile/.env, EXPO_PUBLIC_SUPABASE_URL must be https://…supabase.co (restart Expo after edits). ' +
          'Android emulator: cold-boot the AVD or try phone hotspot if Wi‑Fi blocks SSL.'
      );
    }
    throw new Error(msg);
  }
  if (!data.session || !data.user) throw new Error('Login failed.');

  // Session is valid as soon as sign-in succeeds. Do not block the UI on `profiles`:
  // that query can hang (RLS, network, Web) even when Auth shows the user as signed in.
  void supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single()
    .then(() => {});

  const meta = data.user.user_metadata ?? {};
  return {
    access_token: data.session.access_token,
    user: {
      id: data.user.id,
      email: data.user.email ?? email,
      full_name: typeof meta.full_name === 'string' ? meta.full_name : '',
      role: (meta.role as UserProfile['role']) ?? 'inspector',
      lgu_code: typeof meta.lgu_code === 'string' ? meta.lgu_code : '',
      avatar_url: null,
    },
  };
}

export async function logoutUser(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

export async function getUserToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const session = await getSession();
  if (!session?.user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!profile) return null;

  return {
    id: session.user.id,
    email: session.user.email ?? '',
    full_name: profile.full_name,
    role: profile.role,
    lgu_code: profile.lgu_code,
    avatar_url: profile.avatar_url,
  };
}
