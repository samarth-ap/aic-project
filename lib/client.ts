"use client";
// Browser-side helpers: anonymous device id + professor key storage.

function safeGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* private mode: fine */ }
}

/** Random per-browser id. Never tied to a name or login. */
export function deviceId(): string {
  let id = safeGet("lf.device");
  if (!id) {
    id = crypto.randomUUID();
    safeSet("lf.device", id);
  }
  return id;
}

export function saveAdminKey(code: string, key: string) {
  safeSet(`lf.admin.${code.toUpperCase()}`, key);
}
/** Reads the professor key from the URL hash (#k=...) first, then storage. */
export function adminKey(code: string): string | null {
  const m = typeof window !== "undefined" ? window.location.hash.match(/k=([a-f0-9]+)/) : null;
  if (m) {
    saveAdminKey(code, m[1]);
    return m[1];
  }
  return safeGet(`lf.admin.${code.toUpperCase()}`);
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; key?: string | null } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...(opts.key ? { "x-admin-key": opts.key } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), { status: res.status, data });
  return data as T;
}

export const fmt = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
export const pct = (x: number) => `${Math.round(x * 100)}%`;
