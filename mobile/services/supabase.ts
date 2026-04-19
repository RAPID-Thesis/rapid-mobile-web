import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

/**
 * EAS Build does not upload `mobile/.env` unless you set EXPO_PUBLIC_* in
 * expo.dev → Project → Environment variables (or `eas env:push`).
 * Without them, env vars are empty and the app used to crash on startup.
 * These defaults match `mobile/.env.example` (public anon key + project URL).
 */
const DEFAULT_SUPABASE_URL = 'https://zhyrmtowdomdgyecstcz.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoeXJtdG93ZG9tZGd5ZWNzdGN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjI2ODMsImV4cCI6MjA4ODg5ODY4M30.kvl-uGp-C0k_E1sAFlE6q6Nu058NGD21UQ61scvGp14';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim() || DEFAULT_SUPABASE_URL;
const supabaseAnonKey =
  (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim() || DEFAULT_SUPABASE_ANON_KEY;

if (__DEV__ && !(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim()) {
  console.warn(
    '[RAPID] EXPO_PUBLIC_SUPABASE_URL not set in .env — using embedded project URL for dev.'
  );
}

try {
  const u = new URL(supabaseUrl);
  if (u.protocol !== 'https:') {
    console.warn(
      '[RAPID] EXPO_PUBLIC_SUPABASE_URL should use https:// — phones block plain http to Supabase unless you change Android cleartext settings.'
    );
  }
  if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
    console.warn(
      '[RAPID] Supabase URL is localhost — that is only the emulator/PC itself. On a real phone use https://YOUR-PROJECT.supabase.co (Dashboard → Settings → API).'
    );
  }
} catch {
  console.warn('[RAPID] Invalid EXPO_PUBLIC_SUPABASE_URL:', supabaseUrl);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
