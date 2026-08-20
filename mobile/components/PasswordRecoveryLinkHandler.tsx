import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import type { EmailOtpType } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { supabase } from '../services/supabase';
import { parseTokensFromUrl, setPasswordRecoveryBypass } from '../services/passwordRecovery';

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function applyRecoveryFromUrl(url: string): Promise<boolean> {
  const looksLikeRecovery =
    url.includes('token_hash=') ||
    url.includes('code=') ||
    url.includes('access_token') ||
    url.toLowerCase().includes('type=recovery');
  if (!looksLikeRecovery) return false;

  // Preferred path. verifyOtp needs no locally stored code_verifier, so a link
  // requested on one device opens correctly on any other -- which is the whole
  // point of emailing it.
  const params = Linking.parse(url).queryParams ?? {};
  const tokenHash = firstParam(params.token_hash as string | string[] | undefined);
  if (tokenHash) {
    const type = (firstParam(params.type as string | string[] | undefined) ??
      'recovery') as EmailOtpType;
    setPasswordRecoveryBypass(true);
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      setPasswordRecoveryBypass(false);
      return false;
    }
    return true;
  }

  if (url.includes('code=')) {
    // Legacy PKCE path, for links already sent. Only succeeds on the install that
    // requested the reset, because the verifier lives in this app's AsyncStorage.
    setPasswordRecoveryBypass(true);
    const { error } = await supabase.auth.exchangeCodeForSession(url);
    if (error) {
      setPasswordRecoveryBypass(false);
      return false;
    }
    return true;
  }

  const tokens = parseTokensFromUrl(url);
  if (tokens) {
    setPasswordRecoveryBypass(true);
    const { error } = await supabase.auth.setSession(tokens);
    if (error) {
      setPasswordRecoveryBypass(false);
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Applies Supabase recovery tokens from the app deep link and routes to the reset screen.
 */
export default function PasswordRecoveryLinkHandler() {
  useEffect(() => {
    let active = true;

    async function handle(url: string | null) {
      if (!url || !active) return;
      try {
        const ok = await applyRecoveryFromUrl(url);
        if (active && ok) {
          router.replace('/reset-password');
        }
      } catch {
        setPasswordRecoveryBypass(false);
      }
    }

    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', ({ url }) => {
      void handle(url);
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return null;
}
