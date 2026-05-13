import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { supabase } from '../services/supabase';
import { parseTokensFromUrl, setPasswordRecoveryBypass } from '../services/passwordRecovery';

async function applyRecoveryFromUrl(url: string): Promise<boolean> {
  const looksLikeRecovery =
    url.includes('code=') ||
    url.includes('access_token') ||
    url.toLowerCase().includes('type=recovery');
  if (!looksLikeRecovery) return false;

  if (url.includes('code=')) {
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
