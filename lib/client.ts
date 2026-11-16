"use client";
// Browser-side helpers: anonymous device id, professor key storage, signed-in user.
import { useEffect, useState } from "react";

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

// ---------- signed-in user ----------

export interface Me {
  user: { name: string; email: string; picture: string } | null;
  classes: { code: string; name: string; term: string; role: "instructor" | "ta" | "student"; staff_code?: string }[];
  auth: { google: boolean; dev: boolean };
}

/** Loads /api/me. `me` is undefined while loading. */
export function useMe(): { me: Me | undefined; reload: () => void } {
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    api<Me>("/api/me")
      .then((m) => live && setMe(m))
      .catch(() => live && setMe({ user: null, classes: [], auth: { google: false, dev: false } }));
    return () => {
      live = false;
    };
  }, [n]);
  return { me, reload: () => setN((x) => x + 1) };
}

export const loginHref = (next?: string) =>
  `/login?next=${encodeURIComponent(next ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/dashboard"))}`;

export async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  window.location.href = "/";
}

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
