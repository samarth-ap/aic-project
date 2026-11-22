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

// ---------- quarters ----------
export const QUARTERS = ["Fall", "Winter", "Spring", "Summer"] as const;
export type Quarter = (typeof QUARTERS)[number];

/** The quarter a date falls in (UW calendar: Winter Jan–Mar, Spring Apr–Jun, Summer Jul–Aug, Fall Sep–Dec). */
export function currentQuarter(now = new Date()): { quarter: Quarter; year: number } {
  const m = now.getMonth();
  const quarter: Quarter = m <= 2 ? "Winter" : m <= 5 ? "Spring" : m <= 7 ? "Summer" : "Fall";
  return { quarter, year: now.getFullYear() };
}

/** Reads a stored term like "Fall 2026" or "Autumn 2026" back into a quarter and year. */
export function parseTerm(term: string | null | undefined): { quarter: Quarter | ""; year: number | null } {
  const t = String(term ?? "");
  const q = /\b(fall|autumn|au|winter|wi|spring|sp|summer|su)\b/i.exec(t)?.[1].toLowerCase() ?? "";
  const quarter: Quarter | "" =
    q === "fall" || q === "autumn" || q === "au" ? "Fall" : q.startsWith("wi") ? "Winter" : q.startsWith("sp") ? "Spring" : q.startsWith("su") ? "Summer" : "";
  const y = /\b(20\d\d)\b/.exec(t)?.[1];
  return { quarter, year: y ? Number(y) : null };
}

/** Builds the stored term from the dropdowns; unknown values are dropped. */
export function makeTerm(quarter: string, year: string): string {
  const q = QUARTERS.find((x) => x === quarter);
  if (!q) return "";
  const y = /^20\d\d$/.test(year) ? year : "";
  return y ? `${q} ${y}` : q;
}
