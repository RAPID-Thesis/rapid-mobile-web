const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export function isApiUrlConfigured(): boolean {
  return API_BASE_URL.length > 0;
}

export function buildApiUrl(path: string): string {
  if (!API_BASE_URL) {
    throw new Error('Missing EXPO_PUBLIC_API_URL. Add it to mobile/.env before making API calls.');
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export async function parseApiError(response: Response, fallbackMessage: string): Promise<string> {
  const prefix = `HTTP ${response.status}`;
  let raw: string;
  try {
    raw = await response.text();
  } catch {
    return `${prefix}: (no response body)`;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return `${prefix}: ${fallbackMessage}`;
  }

  try {
    const data = JSON.parse(trimmed) as { detail?: unknown };
    if (typeof data.detail === 'string') {
      return `${prefix}: ${data.detail}`;
    }

    if (Array.isArray(data.detail) && data.detail.length > 0) {
      const parts = data.detail.map((item: unknown) => {
        if (item && typeof item === 'object' && 'msg' in item) {
          const o = item as { msg?: string; loc?: unknown };
          const loc = Array.isArray(o.loc) ? o.loc.join('.') : '';
          const msg = o.msg ?? '';
          return loc ? `${loc}: ${msg}` : msg;
        }
        return JSON.stringify(item);
      });
      const joined = parts.filter(Boolean).join(' | ');
      if (joined) return `${prefix}: ${joined}`;
    }
  } catch {
    // not JSON — show snippet below
  }

  const snippet = trimmed.length > 280 ? `${trimmed.slice(0, 280)}…` : trimmed;
  return `${prefix}: ${snippet}`;
}
