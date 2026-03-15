const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export function buildApiUrl(path: string): string {
  if (!API_BASE_URL) {
    throw new Error('Missing EXPO_PUBLIC_API_URL. Add it to mobile/.env before making API calls.');
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export async function parseApiError(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: string | { msg?: string }[] };
    if (typeof data.detail === 'string') {
      return data.detail;
    }

    if (Array.isArray(data.detail) && data.detail.length > 0) {
      return data.detail
        .map((item) => item.msg)
        .filter((value): value is string => Boolean(value))
        .join(', ');
    }
  } catch {
    // Ignore parse errors and fall back to the default message.
  }

  return fallbackMessage;
}
