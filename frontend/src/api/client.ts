const TOKEN_KEY = 'rt_token';

const API_BASE: string = (import.meta as any).env?.VITE_API_URL || '';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  details?: any;
  constructor(message: string, status: number, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { ...options, headers });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  }

  if (res.status === 401 && path !== '/auth/login') {
    setToken(null);
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/csv')) {
    const blob = await res.blob();
    return blob as unknown as T;
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok || !body?.success) {
    const msg = body?.error || `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, body?.details);
  }
  return body.data as T;
}

export const api = {
  get: <T = any>(path: string) => request<T>(path),
  post: <T = any>(path: string, data?: any) => request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  put: <T = any>(path: string, data?: any) => request<T>(path, { method: 'PUT', body: JSON.stringify(data ?? {}) }),
  del: <T = any>(path: string) => request<T>(path, { method: 'DELETE' }),
  download: (path: string) => request<Blob>(path, { method: 'GET' }),
};

export function downloadCsv(url: string, filename: string) {
  const token = getToken();
  fetch(`${API_BASE}/api${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then((r) => r.blob())
    .then((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    });
}
