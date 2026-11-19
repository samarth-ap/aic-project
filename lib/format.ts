// Formatting shared by server and client code.

/** Lecture time as mm:ss (or h:mm:ss), e.g. 22:03. */
export const fmtClock = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/** 0:00-style label for chart axes. */
export const fmtAxis = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** "Wed 11 Nov" */
export const fmtDay = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");

/** "18 Dec" */
export const fmtShortDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export const minutesLong = (ms: number) => `${Math.max(1, Math.round(ms / 60_000))} min`;

export function ago(ms: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

export const daysUntil = (ms: number, now = Date.now()) => Math.ceil((ms - now) / 86_400_000);

/** "K7M 2QP" */
export const spacedCode = (code: string) => (code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code);

export const initials = (name: string) =>
  name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
