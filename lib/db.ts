// Storage layer. Every query in the app goes through the functions exported here.
//
// Two backends, same SQL:
//  - Postgres when DATABASE_URL (or POSTGRES_URL) is set — use this on Vercel,
//    whose filesystem is wiped between requests. Works with Neon or Supabase.
//  - Otherwise SQLite via Node's built-in `node:sqlite` (Node 22.5+), one file
//    on disk: data/lostfound.db. Nothing to set up for local development.
//
// All functions are async so both backends share one API.
import crypto from "node:crypto";

export type TapKind = "lost" | "too_fast" | "example" | "got_it";
export const TAP_KINDS: TapKind[] = ["lost", "too_fast", "example", "got_it"];

export interface Session {
  id: number;
  code: string;
  admin_key: string;
  title: string;
  course: string;
  started_at: number; // epoch ms
  ended_at: number | null;
}
export interface Tap {
  id: number;
  session_id: number;
  device_id: string;
  kind: TapKind;
  t_ms: number; // ms since session start
}
export interface Question {
  id: number;
  session_id: number;
  device_id: string;
  t_ms: number;
  text: string;
}
export interface TranscriptSegment {
  id: number;
  session_id: number;
  start_ms: number;
  end_ms: number;
  text: string;
}


const PG_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
export const usingPostgres = Boolean(PG_URL);

type Row = Record<string, unknown>;
interface Driver {
  all(sql: string, params?: unknown[]): Promise<Row[]>;
  exec(sql: string): Promise<void>;
}

// --- schema (same tables in both; Postgres needs BIGINT for epoch-ms values) ---
function schema(pg: boolean) {
  const id = pg ? "BIGSERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
  const big = pg ? "BIGINT" : "INTEGER";
  const ref = pg ? "BIGINT" : "INTEGER";
  return `
    CREATE TABLE IF NOT EXISTS sessions (
      id ${id},
      code TEXT UNIQUE NOT NULL,
      admin_key TEXT NOT NULL,
      title TEXT NOT NULL,
      course TEXT NOT NULL DEFAULT '',
      started_at ${big} NOT NULL,
      ended_at ${big}
    );
    CREATE TABLE IF NOT EXISTS taps (
      id ${id},
      session_id ${ref} NOT NULL REFERENCES sessions(id),
      device_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      t_ms ${big} NOT NULL
    );
    CREATE INDEX IF NOT EXISTS taps_session ON taps(session_id, t_ms);
    CREATE TABLE IF NOT EXISTS questions (
      id ${id},
      session_id ${ref} NOT NULL REFERENCES sessions(id),
      device_id TEXT NOT NULL,
      t_ms ${big} NOT NULL,
      text TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transcript (
      id ${id},
      session_id ${ref} NOT NULL REFERENCES sessions(id),
      start_ms ${big} NOT NULL,
      end_ms ${big} NOT NULL,
      text TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS transcript_session ON transcript(session_id, start_ms);
    CREATE TABLE IF NOT EXISTS presence (
      session_id ${ref} NOT NULL REFERENCES sessions(id),
      device_id TEXT NOT NULL,
      first_seen ${big} NOT NULL,
      last_seen ${big} NOT NULL,
      PRIMARY KEY (session_id, device_id)
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id ${id},
      session_id ${ref} NOT NULL REFERENCES sessions(id),
      device_id TEXT NOT NULL,
      role TEXT NOT NULL,          -- 'user' | 'assistant'
      kind TEXT NOT NULL,          -- 'text' | 'lost' | 'example'  (lost/example = auto prompt from a tap)
      t_ms ${big} NOT NULL,        -- lecture time when sent
      content TEXT NOT NULL,
      created_at ${big} NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chat_device ON chat_messages(session_id, device_id, id);
    CREATE TABLE IF NOT EXISTS reports (
      session_id ${ref} PRIMARY KEY REFERENCES sessions(id),
      json TEXT NOT NULL,
      created_at ${big} NOT NULL
    );
  `;
}

async function postgresDriver(url: string): Promise<Driver> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, {
    max: 5,
    idle_timeout: 20,
    prepare: false, // works behind poolers (Supabase/Neon pooled URLs)
    // BIGINT / COUNT(*) come back as strings by default; all ours fit in a JS number.
    types: { bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
    onnotice: () => {},
  });
  // `?` placeholders -> $1, $2, ...
  const toPg = (q: string) => {
    let i = 0;
    return q.replace(/\?/g, () => `$${++i}`);
  };
  return {
    all: async (q, params = []) => (await sql.unsafe(toPg(q), params as never[])) as unknown as Row[],
    exec: async (q) => {
      await sql.unsafe(q);
    },
  };
}

async function sqliteDriver(): Promise<Driver> {
  const { DatabaseSync } = await import("node:sqlite");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const file = process.env.DB_PATH ?? path.join(process.cwd(), "data", "lostfound.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new DatabaseSync(file);
  d.exec("PRAGMA journal_mode = WAL;");
  return {
    all: async (q, params = []) => d.prepare(q).all(...(params as never[])) as Row[],
    exec: async (q) => d.exec(q),
  };
}

let _driver: Promise<Driver> | null = null;
function driver(): Promise<Driver> {
  if (!_driver) {
    _driver = (async () => {
      const d = PG_URL ? await postgresDriver(PG_URL) : await sqliteDriver();
      try {
        await d.exec(schema(Boolean(PG_URL)));
      } catch (e) {
        // Two cold starts creating tables at the same moment can race; the second try sees them.
        await d.exec(schema(Boolean(PG_URL))).catch(() => {
          throw e;
        });
      }
      return d;
    })().catch((e) => {
      _driver = null;
      throw e;
    });
  }
  return _driver;
}

async function all<T>(q: string, params: unknown[] = []): Promise<T[]> {
  return (await (await driver()).all(q, params)) as T[];
}
async function one<T>(q: string, params: unknown[] = []): Promise<T | undefined> {
  return (await all<T>(q, params))[0];
}
async function run(q: string, params: unknown[] = []): Promise<void> {
  await all(q, params);
}
/** Postgres rows can carry ids as numbers; make sure Session/Tap ids are plain numbers. */
const num = <T extends Row>(r: T): T => {
  for (const k of ["id", "session_id"]) if (k in r && r[k] != null) (r as Row)[k] = Number(r[k]);
  return r;
};

function newCode(): string {
  // 6 chars, no look-alikes (0/O, 1/I/L)
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function createSession(title: string, course: string, startedAt = Date.now()): Promise<Session> {
  const adminKey = crypto.randomBytes(16).toString("hex");
  // Codes are random; retry on the (very unlikely) collision.
  for (let attempt = 0; ; attempt++) {
    try {
      const row = await one<Session>(
        "INSERT INTO sessions (code, admin_key, title, course, started_at) VALUES (?, ?, ?, ?, ?) RETURNING *",
        [newCode(), adminKey, title, course, startedAt],
      );
      return num(row as unknown as Row) as unknown as Session;
    } catch (e) {
      if (attempt >= 3) throw e;
    }
  }
}

export async function getSessionById(id: number): Promise<Session | undefined> {
  const r = await one<Session>("SELECT * FROM sessions WHERE id = ?", [id]);
  return r && (num(r as unknown as Row) as unknown as Session);
}
export async function getSession(code: string): Promise<Session | undefined> {
  const r = await one<Session>("SELECT * FROM sessions WHERE code = ?", [code.toUpperCase()]);
  return r && (num(r as unknown as Row) as unknown as Session);
}
export async function listSessions(course?: string): Promise<Session[]> {
  const rows = course
    ? await all<Session>("SELECT * FROM sessions WHERE course = ? ORDER BY started_at", [course])
    : await all<Session>("SELECT * FROM sessions ORDER BY started_at");
  return rows.map((r) => num(r as unknown as Row) as unknown as Session);
}
export async function endSession(id: number, endedAt = Date.now()) {
  await run("UPDATE sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL", [endedAt, id]);
}

export async function addTap(sessionId: number, deviceId: string, kind: TapKind, tMs: number) {
  await run("INSERT INTO taps (session_id, device_id, kind, t_ms) VALUES (?, ?, ?, ?)", [sessionId, deviceId, kind, tMs]);
}
export async function lastTapMs(sessionId: number, deviceId: string): Promise<number | null> {
  const row = await one<{ t: number | null }>(
    "SELECT MAX(t_ms) AS t FROM taps WHERE session_id = ? AND device_id = ?",
    [sessionId, deviceId],
  );
  return row?.t == null ? null : Number(row.t);
}
export async function getTaps(sessionId: number): Promise<Tap[]> {
  return all<Tap>("SELECT * FROM taps WHERE session_id = ? ORDER BY t_ms", [sessionId]);
}

export async function addQuestion(sessionId: number, deviceId: string, tMs: number, text: string) {
  await run("INSERT INTO questions (session_id, device_id, t_ms, text) VALUES (?, ?, ?, ?)", [sessionId, deviceId, tMs, text]);
}
export async function getQuestions(sessionId: number): Promise<Question[]> {
  return all<Question>("SELECT * FROM questions WHERE session_id = ? ORDER BY t_ms", [sessionId]);
}

export async function addTranscript(sessionId: number, segs: { start_ms: number; end_ms: number; text: string }[]) {
  // One multi-row INSERT per 200 segments, so a whole caption file is a few round trips.
  for (let i = 0; i < segs.length; i += 200) {
    const chunk = segs.slice(i, i + 200);
    await run(
      `INSERT INTO transcript (session_id, start_ms, end_ms, text) VALUES ${chunk.map(() => "(?, ?, ?, ?)").join(", ")}`,
      chunk.flatMap((s) => [sessionId, Math.round(s.start_ms), Math.round(s.end_ms), s.text]),
    );
  }
}
export async function clearTranscript(sessionId: number) {
  await run("DELETE FROM transcript WHERE session_id = ?", [sessionId]);
}
export async function getTranscript(sessionId: number): Promise<TranscriptSegment[]> {
  return all<TranscriptSegment>("SELECT * FROM transcript WHERE session_id = ? ORDER BY start_ms", [sessionId]);
}

/** Student page heartbeat; `now` is ms since session start. */
export async function touchPresence(sessionId: number, deviceId: string, now: number) {
  await run(
    `INSERT INTO presence (session_id, device_id, first_seen, last_seen) VALUES (?, ?, ?, ?)
     ON CONFLICT(session_id, device_id) DO UPDATE SET last_seen = excluded.last_seen`,
    [sessionId, deviceId, now, now],
  );
}
export async function countPresence(sessionId: number, sinceMs?: number): Promise<number> {
  const row =
    sinceMs === undefined
      ? await one<{ n: number }>("SELECT COUNT(*) AS n FROM presence WHERE session_id = ?", [sessionId])
      : await one<{ n: number }>("SELECT COUNT(*) AS n FROM presence WHERE session_id = ? AND last_seen >= ?", [
          sessionId,
          sinceMs,
        ]);
  return Number(row?.n ?? 0);
}

export async function saveReport(sessionId: number, report: unknown) {
  await run(
    `INSERT INTO reports (session_id, json, created_at) VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET json = excluded.json, created_at = excluded.created_at`,
    [sessionId, JSON.stringify(report), Date.now()],
  );
}
export async function getReport<T>(sessionId: number): Promise<T | null> {
  const row = await one<{ json: string }>("SELECT json FROM reports WHERE session_id = ?", [sessionId]);
  return row ? (JSON.parse(row.json) as T) : null;
}

// ---------- AI tutor chat (one private thread per student per lecture) ----------

export type ChatKind = "text" | "lost" | "example";
export interface ChatMessage {
  id: number;
  session_id: number;
  device_id: string;
  role: "user" | "assistant";
  kind: ChatKind;
  t_ms: number;
  content: string;
  created_at: number;
}

export async function addChatMessage(
  sessionId: number,
  deviceId: string,
  role: ChatMessage["role"],
  kind: ChatKind,
  tMs: number,
  content: string,
) {
  await run(
    "INSERT INTO chat_messages (session_id, device_id, role, kind, t_ms, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [sessionId, deviceId, role, kind, Math.round(tMs), content, Date.now()],
  );
}
export async function getChat(sessionId: number, deviceId: string): Promise<ChatMessage[]> {
  return all<ChatMessage>("SELECT * FROM chat_messages WHERE session_id = ? AND device_id = ? ORDER BY id", [
    sessionId,
    deviceId,
  ]);
}
/** Messages this device sent since `sinceEpochMs` (for rate limiting). */
export async function recentChatCount(sessionId: number, deviceId: string, sinceEpochMs: number): Promise<number> {
  const row = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM chat_messages WHERE session_id = ? AND device_id = ? AND role = 'user' AND created_at >= ?",
    [sessionId, deviceId, sinceEpochMs],
  );
  return Number(row?.n ?? 0);
}
/** Typed questions students asked the AI tutor (not tap prompts). For the professor's themes. */
export async function getChatQuestions(sessionId: number): Promise<{ device_id: string; t_ms: number; text: string }[]> {
  return all("SELECT device_id, t_ms, content AS text FROM chat_messages WHERE session_id = ? AND role = 'user' AND kind = 'text' ORDER BY t_ms", [
    sessionId,
  ]);
}
