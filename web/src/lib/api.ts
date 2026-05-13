/** Base URL for FastAPI (set `VITE_API_URL` in `web/.env`, e.g. http://localhost:8000). */
const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export function isApiUrlConfigured(): boolean {
  return API_BASE_URL.length > 0;
}

export function buildApiUrl(path: string): string {
  if (!API_BASE_URL) {
    throw new Error('Missing VITE_API_URL. Add it to web/.env for admin actions that call the backend.');
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
