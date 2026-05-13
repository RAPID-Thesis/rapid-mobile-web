/** While true, pending profiles are not signed out (Supabase password recovery session). */
let passwordRecoveryBypass = false;

export function setPasswordRecoveryBypass(value: boolean): void {
  passwordRecoveryBypass = value;
}

export function getPasswordRecoveryBypass(): boolean {
  return passwordRecoveryBypass;
}

export function parseTokensFromUrl(url: string): { access_token: string; refresh_token: string } | null {
  try {
    const hashIdx = url.indexOf('#');
    if (hashIdx < 0) return null;
    const params = new URLSearchParams(url.slice(hashIdx + 1));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) return { access_token, refresh_token };
  } catch {
    /* ignore */
  }
  return null;
}
