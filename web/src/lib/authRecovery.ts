/** True while the SPA is on the password reset route (Supabase recovery session). */
export function isWebPasswordResetRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === '/reset-password';
}
