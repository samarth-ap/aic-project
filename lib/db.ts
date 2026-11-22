// Storage layer. Every query in the app goes through the functions exported here.
//
// Two backends, same SQL:
//  - Postgres when DATABASE_URL (or POSTGRES_URL) is set — use this on Vercel,
//    whose filesystem is wiped between requests. Works with Neon or Supabase.
//  - Otherwise SQLite via Node's built-in `node:sqlite` (Node 22.5+), one file
//    on disk: data/lostfound.db. Nothing to set up for local development.
//
// All times inside a lecture are milliseconds from the start of the professor's
// recording (`t_ms`), set by the server, so every student shares one timeline.
import crypto from "node:crypto";

const PG_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
export const usingPostgres = Boolean(PG_URL);

type Row = Record<string, unknown>;
interface Driver {
  all(sql: string, params?: unknown[]): Promise<Row[]>;
  exec(sql: string): Promise<void>;
}

// ---------- schema ----------

function schema(pg: boolean) {
  const id = pg ? "BIGSERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
  const big = pg ? "BIGINT" : "INTEGER";
  const blob = pg ? "BYTEA" : "BLOB";
  return `
    CREATE TABLE IF NOT EXISTS users (
      id ${id},
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      picture TEXT NOT NULL DEFAULT '',
      created_at ${big} NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id ${big} NOT NULL REFERENCES users(id),
      created_at ${big} NOT NULL,
      expires_at ${big} NOT NULL
    );
    CREATE TABLE IF NOT EXISTS email_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at ${big} NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      sent_at ${big} NOT NULL
    );
    CREATE TABLE IF NOT EXISTS classes (
      id ${id},
      code TEXT UNIQUE NOT NULL,
      staff_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      term TEXT NOT NULL DEFAULT '',
      allow_guests INTEGER NOT NULL DEFAULT 0,
      created_by ${big} REFERENCES users(id),
      created_at ${big} NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memberships (
      class_id ${big} NOT NULL REFERENCES classes(id),
      user_id ${big} NOT NULL REFERENCES users(id),
      role TEXT NOT NULL,
      joined_at ${big} NOT NULL,
      PRIMARY KEY (class_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS memberships_user ON memberships(user_id);
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
      session_id ${big} NOT NULL REFERENCES sessions(id),
      device_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      t_ms ${big} NOT NULL
    );
    CREATE INDEX IF NOT EXISTS taps_session ON taps(session_id, t_ms);
    CREATE TABLE IF NOT EXISTS transcript (
      id ${id},
      session_id ${big} NOT NULL REFERENCES sessions(id),
      start_ms ${big} NOT NULL,
      end_ms ${big} NOT NULL,
      text TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS transcript_session ON transcript(session_id, start_ms);
    CREATE TABLE IF NOT EXISTS presence (
      session_id ${big} NOT NULL REFERENCES sessions(id),
      device_id TEXT NOT NULL,
      first_seen ${big} NOT NULL,
      last_seen ${big} NOT NULL,
      PRIMARY KEY (session_id, device_id)
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id ${id},
      session_id ${big} NOT NULL REFERENCES sessions(id),
      device_id TEXT NOT NULL,
      role TEXT NOT NULL,
      kind TEXT NOT NULL,
      t_ms ${big} NOT NULL,
      content TEXT NOT NULL,
      created_at ${big} NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chat_device ON chat_messages(session_id, device_id, id);

    -- One "Lost" moment: a tap and the tutor thread it opened.
    CREATE TABLE IF NOT EXISTS confusion_events (
      id ${id},
      session_id ${big} NOT NULL REFERENCES sessions(id),
      actor TEXT NOT NULL,
      t_ms ${big} NOT NULL,
      last_tap_ms ${big} NOT NULL,
      concept TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',   -- open | got_it | fuzzy
      followups INTEGER NOT NULL DEFAULT 0,
      closed_at_ms ${big},
      created_at ${big} NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_session ON confusion_events(session_id, t_ms);
    CREATE INDEX IF NOT EXISTS events_actor ON confusion_events(actor, session_id);

    CREATE TABLE IF NOT EXISTS hotspots (
      id ${id},
      session_id ${big} NOT NULL REFERENCES sessions(id),
      start_ms ${big} NOT NULL,
      end_ms ${big} NOT NULL,
      students INTEGER NOT NULL,
      concept TEXT NOT NULL DEFAULT '',
      excerpt TEXT NOT NULL DEFAULT '',
      questions_json TEXT NOT NULL DEFAULT '[]',
      draft TEXT NOT NULL DEFAULT '',
      published TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',  -- draft | published | dismissed
      link_url TEXT NOT NULL DEFAULT '',
      link_title TEXT NOT NULL DEFAULT '',
      published_at ${big},
      actors_json TEXT NOT NULL DEFAULT '[]', -- hashed ids, server-side only
      rank INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS hotspots_session ON hotspots(session_id, rank);
    CREATE TABLE IF NOT EXISTS hotspot_views (
      hotspot_id ${big} NOT NULL REFERENCES hotspots(id),
      actor TEXT NOT NULL,
      opened_at ${big} NOT NULL,
      got_it INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (hotspot_id, actor)
    );
    CREATE TABLE IF NOT EXISTS audio_chunks (
      id ${id},
      session_id ${big} NOT NULL REFERENCES sessions(id),
      run_id TEXT NOT NULL,
      run_start_ms ${big} NOT NULL,
      seq INTEGER NOT NULL,
      mime TEXT NOT NULL,
      data ${blob} NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audio_session ON audio_chunks(session_id, run_start_ms, seq);
    CREATE TABLE IF NOT EXISTS user_prefs (
      user_id ${big} PRIMARY KEY REFERENCES users(id),
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS study_progress (
      user_id ${big} NOT NULL REFERENCES users(id),
      topic_key TEXT NOT NULL,
      status TEXT NOT NULL,          -- cleared | checked
      score INTEGER NOT NULL DEFAULT 0,
      updated_at ${big} NOT NULL,
      PRIMARY KEY (user_id, topic_key)
    );
    CREATE TABLE IF NOT EXISTS ai_cache (
      key TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      created_at ${big} NOT NULL
    );
  `;
}

/** Columns added after the first release. Safe to run on every cold start. */
async function migrate(d: Driver, pg: boolean) {
  const big = pg ? "BIGINT" : "INTEGER";
  const cols: [string, string, string][] = [
    ["users", "kind", "TEXT NOT NULL DEFAULT 'student'"],
    ["sessions", "class_id", big],
    ["sessions", "created_by", big],
    ["sessions", "slides_name", "TEXT NOT NULL DEFAULT ''"],
    ["sessions", "slides_text", "TEXT NOT NULL DEFAULT ''"],
    ["sessions", "live_count_on", "INTEGER NOT NULL DEFAULT 0"],
    ["sessions", "summary_json", "TEXT NOT NULL DEFAULT ''"],
    ["sessions", "summary_at", big],
    ["sessions", "processed_at", big],
    ["sessions", "insights_json", "TEXT NOT NULL DEFAULT ''"],
    ["classes", "exam_name", "TEXT NOT NULL DEFAULT ''"],
    ["classes", "exam_date", big],
    ["classes", "audio_delete_on", big],
    ["classes", "graded_notes", "TEXT NOT NULL DEFAULT ''"],
    ["chat_messages", "event_id", big],
  ];
  for (const [table, col, type] of cols) {
    if (pg) await d.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`);
    else await d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`).catch(() => {});
  }
  await d.exec("CREATE INDEX IF NOT EXISTS sessions_class ON sessions(class_id, started_at)");
  await d.exec("CREATE INDEX IF NOT EXISTS chat_event ON chat_messages(event_id, id)");
}

async function postgresDriver(url: string): Promise<Driver> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, {
    max: 5,
    idle_timeout: 20,
    prepare: false,
    types: { bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
    onnotice: () => {},
  });
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
  d.exec("PRAGMA busy_timeout = 5000;");
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
      const setup = async () => {
        await d.exec(schema(Boolean(PG_URL)));
        await migrate(d, Boolean(PG_URL));
      };
      try {
        await setup();
      } catch (e) {
        await setup().catch(() => {
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

const NUMERIC = new Set([
  "id", "session_id", "class_id", "user_id", "created_by", "allow_guests", "t_ms", "last_tap_ms", "started_at", "ended_at",
  "created_at", "joined_at", "students", "start_ms", "end_ms", "rank", "followups", "closed_at_ms", "published_at",
  "summary_at", "processed_at", "exam_date", "audio_delete_on", "live_count_on", "event_id", "hotspot_id", "opened_at",
  "got_it", "n", "score", "updated_at", "run_start_ms", "seq", "first_seen", "last_seen", "expires_at", "attempts", "sent_at",
]);
const num = <T>(r: Row): T => {
  for (const k of Object.keys(r)) if (NUMERIC.has(k) && r[k] != null) r[k] = Number(r[k]);
  return r as T;
};

async function all<T>(q: string, params: unknown[] = []): Promise<T[]> {
  return (await (await driver()).all(q, params)).map((r) => num<T>(r));
}
async function one<T>(q: string, params: unknown[] = []): Promise<T | undefined> {
  return (await all<T>(q, params))[0];
}
async function run(q: string, params: unknown[] = []): Promise<void> {
  await (await driver()).all(q, params);
}
const qs = (n: number) => Array.from({ length: n }, () => "?").join(", ");
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no look-alikes (0/O, 1/I/L)
function randomCode(len: number): string {
  return Array.from(crypto.randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

// ======================= users & sign-in =======================

export type UserKind = "student" | "professor";
export interface User {
  id: number;
  email: string;
  name: string;
  picture: string;
  kind: UserKind;
  created_at: number;
}

/** Creates or updates a user. A blank name keeps the existing one. */
export async function upsertUser(email: string, name: string, picture = ""): Promise<User> {
  const e = email.trim().toLowerCase();
  const n = name.trim();
  await run(
    `INSERT INTO users (email, name, picture, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       name = CASE WHEN ? = '' THEN users.name ELSE excluded.name END,
       picture = CASE WHEN excluded.picture = '' THEN users.picture ELSE excluded.picture END`,
    [e, n || e.split("@")[0], picture, Date.now(), n],
  );
  return (await one<User>("SELECT * FROM users WHERE email = ?", [e]))!;
}
export async function getUser(id: number): Promise<User | undefined> {
  return one<User>("SELECT * FROM users WHERE id = ?", [id]);
}
export async function setUserKind(id: number, kind: UserKind) {
  await run("UPDATE users SET kind = ? WHERE id = ?", [kind, id]);
}

export async function createAuthSession(userId: number, ttlMs: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  await run("INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [
    sha256(token),
    userId,
    now,
    now + ttlMs,
  ]);
  return token;
}
export async function userForToken(token: string): Promise<User | null> {
  return (
    (await one<User>(
      `SELECT u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
      [sha256(token), Date.now()],
    )) ?? null
  );
}
export async function deleteAuthSession(token: string) {
  await run("DELETE FROM auth_sessions WHERE token_hash = ?", [sha256(token)]);
}

/** Stores a fresh 6-digit code for this email; returns it (to email it). */
export async function createEmailCode(email: string, ttlMs = 10 * 60_000): Promise<string> {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const now = Date.now();
  await run(
    `INSERT INTO email_codes (email, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at`,
    [email, sha256(`${email}:${code}`), now + ttlMs, now],
  );
  return code;
}
export async function lastEmailCodeSent(email: string): Promise<number | null> {
  return (await one<{ sent_at: number }>("SELECT sent_at FROM email_codes WHERE email = ?", [email]))?.sent_at ?? null;
}
/** True if the code matches. Five wrong tries burn the code. */
export async function checkEmailCode(email: string, code: string): Promise<boolean> {
  const row = await one<{ code_hash: string; expires_at: number; attempts: number }>(
    "SELECT code_hash, expires_at, attempts FROM email_codes WHERE email = ?",
    [email],
  );
  if (!row || row.expires_at < Date.now() || row.attempts >= 5) return false;
  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(sha256(`${email}:${code}`)));
  if (ok) await run("DELETE FROM email_codes WHERE email = ?", [email]);
  else await run("UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?", [email]);
  return ok;
}

export interface Prefs {
  notify_lecture: boolean;
  study_reminder: boolean;
  dark_live: boolean;
  /** Student's own exam date per class code (when the professor hasn't set one). */
  exam_dates: Record<string, number>;
  seen_anon_note: boolean;
}
export const DEFAULT_PREFS: Prefs = { notify_lecture: true, study_reminder: false, dark_live: true, exam_dates: {}, seen_anon_note: false };
export async function getPrefs(userId: number): Promise<Prefs> {
  const r = await one<{ json: string }>("SELECT json FROM user_prefs WHERE user_id = ?", [userId]);
  return { ...DEFAULT_PREFS, ...(r ? JSON.parse(r.json) : {}) };
}
export async function setPrefs(userId: number, p: Partial<Prefs>) {
  const next = { ...(await getPrefs(userId)), ...p };
  await run(
    `INSERT INTO user_prefs (user_id, json) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json`,
    [userId, JSON.stringify(next)],
  );
}

// ======================= classes =======================

export type Role = "instructor" | "ta" | "student";
export interface Class {
  id: number;
  code: string;
  staff_code: string;
  name: string;
  term: string;
  allow_guests: number;
  created_by: number | null;
  created_at: number;
  exam_name: string;
  exam_date: number | null;
  audio_delete_on: number | null;
  graded_notes: string;
}

export async function createClass(name: string, term: string, userId: number, audioDeleteOn: number | null = null): Promise<Class> {
  for (let attempt = 0; ; attempt++) {
    try {
      const c = (await one<Class>(
        "INSERT INTO classes (code, staff_code, name, term, allow_guests, created_by, created_at, audio_delete_on) VALUES (?, ?, ?, ?, 0, ?, ?, ?) RETURNING *",
        [randomCode(6), "T" + randomCode(7), name, term, userId, Date.now(), audioDeleteOn],
      ))!;
      await addMembership(c.id, userId, "instructor");
      return c;
    } catch (e) {
      if (attempt >= 3) throw e;
    }
  }
}
export async function getClassByCode(code: string): Promise<Class | undefined> {
  return one<Class>("SELECT * FROM classes WHERE code = ?", [code.replace(/\s+/g, "").toUpperCase()]);
}
export async function getClassByStaffCode(code: string): Promise<Class | undefined> {
  return one<Class>("SELECT * FROM classes WHERE staff_code = ?", [code.replace(/\s+/g, "").toUpperCase()]);
}
export async function getClassById(id: number): Promise<Class | undefined> {
  return one<Class>("SELECT * FROM classes WHERE id = ?", [id]);
}
export async function updateClass(
  id: number,
  f: Partial<Pick<Class, "name" | "term" | "exam_name" | "exam_date" | "audio_delete_on" | "graded_notes">>,
) {
  const c = await getClassById(id);
  if (!c) return;
  const m = { ...c, ...f };
  await run("UPDATE classes SET name = ?, term = ?, exam_name = ?, exam_date = ?, audio_delete_on = ?, graded_notes = ? WHERE id = ?", [
    m.name,
    m.term,
    m.exam_name,
    m.exam_date,
    m.audio_delete_on,
    m.graded_notes,
    id,
  ]);
}
export async function regenerateClassCode(id: number): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const code = randomCode(6);
    try {
      await run("UPDATE classes SET code = ? WHERE id = ?", [code, id]);
      return code;
    } catch (e) {
      if (attempt >= 3) throw e;
    }
  }
}

const ROLE_RANK: Record<Role, number> = { student: 0, ta: 1, instructor: 2 };
/** Adds a member; never downgrades an existing role. */
export async function addMembership(classId: number, userId: number, role: Role) {
  const cur = await getRole(classId, userId);
  if (cur && ROLE_RANK[cur] >= ROLE_RANK[role]) return;
  await run(
    `INSERT INTO memberships (class_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(class_id, user_id) DO UPDATE SET role = excluded.role`,
    [classId, userId, role, Date.now()],
  );
}
export async function removeMembership(classId: number, userId: number) {
  await run("DELETE FROM memberships WHERE class_id = ? AND user_id = ? AND role = 'student'", [classId, userId]);
}
export async function getRole(classId: number, userId: number): Promise<Role | null> {
  return (await one<{ role: Role }>("SELECT role FROM memberships WHERE class_id = ? AND user_id = ?", [classId, userId]))?.role ?? null;
}
export async function classesForUser(userId: number): Promise<(Class & { role: Role })[]> {
  return all<Class & { role: Role }>(
    `SELECT c.*, m.role FROM memberships m JOIN classes c ON c.id = m.class_id WHERE m.user_id = ? ORDER BY c.created_at DESC`,
    [userId],
  );
}
/** Names only, for staff (class settings). Never joined with taps or chats. */
export async function roster(classId: number): Promise<{ user_id: number; name: string; email: string; role: Role; joined_at: number }[]> {
  return all(
    `SELECT u.id AS user_id, u.name, u.email, m.role, m.joined_at FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.class_id = ? ORDER BY CASE m.role WHEN 'instructor' THEN 0 WHEN 'ta' THEN 1 ELSE 2 END, u.name`,
    [classId],
  );
}
export async function countEnrolled(classId: number): Promise<number> {
  return (await one<{ n: number }>("SELECT COUNT(*) AS n FROM memberships WHERE class_id = ? AND role = 'student'", [classId]))?.n ?? 0;
}

// ======================= lectures =======================

export interface Session {
  id: number;
  code: string;
  admin_key: string;
  title: string;
  course: string;
  started_at: number;
  ended_at: number | null;
  class_id: number | null;
  created_by: number | null;
  slides_name: string;
  slides_text: string;
  live_count_on: number;
  summary_json: string;
  summary_at: number | null;
  processed_at: number | null;
  insights_json: string;
}
export type LectureStatus = "live" | "processing" | "ready";
export const lectureStatus = (s: Session): LectureStatus => (!s.ended_at ? "live" : s.processed_at ? "ready" : "processing");

export async function createSession(
  title: string,
  course: string,
  startedAt = Date.now(),
  opts: { classId?: number | null; createdBy?: number | null } = {},
): Promise<Session> {
  const adminKey = crypto.randomBytes(16).toString("hex");
  for (let attempt = 0; ; attempt++) {
    try {
      return (await one<Session>(
        "INSERT INTO sessions (code, admin_key, title, course, started_at, class_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *",
        [randomCode(6), adminKey, title, course, startedAt, opts.classId ?? null, opts.createdBy ?? null],
      ))!;
    } catch (e) {
      if (attempt >= 3) throw e;
    }
  }
}
export async function getSessionById(id: number): Promise<Session | undefined> {
  return one<Session>("SELECT * FROM sessions WHERE id = ?", [id]);
}
export async function getSession(code: string): Promise<Session | undefined> {
  return one<Session>("SELECT * FROM sessions WHERE code = ?", [code.replace(/\s+/g, "").toUpperCase()]);
}
export async function endSession(id: number, endedAt = Date.now()) {
  await run("UPDATE sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL", [endedAt, id]);
}
export async function sessionsForClass(classId: number): Promise<Session[]> {
  return all<Session>("SELECT * FROM sessions WHERE class_id = ? ORDER BY started_at DESC", [classId]);
}
export async function liveSessionsForClasses(classIds: number[]): Promise<Session[]> {
  if (!classIds.length) return [];
  return all<Session>(`SELECT * FROM sessions WHERE ended_at IS NULL AND class_id IN (${qs(classIds.length)}) ORDER BY started_at DESC`, classIds);
}
export async function setSessionFields(
  id: number,
  f: Partial<Pick<Session, "title" | "slides_name" | "slides_text" | "live_count_on" | "summary_json" | "summary_at" | "processed_at" | "insights_json">>,
) {
  const keys = Object.keys(f) as (keyof typeof f)[];
  if (!keys.length) return;
  await run(`UPDATE sessions SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, [...keys.map((k) => f[k]), id]);
}
/** Deletes a lecture and everything recorded in it. */
export async function deleteSession(id: number) {
  await run("DELETE FROM hotspot_views WHERE hotspot_id IN (SELECT id FROM hotspots WHERE session_id = ?)", [id]);
  for (const t of ["hotspots", "chat_messages", "confusion_events", "taps", "transcript", "presence", "audio_chunks"])
    await run(`DELETE FROM ${t} WHERE session_id = ?`, [id]);
  await run("DELETE FROM sessions WHERE id = ?", [id]);
}
/** 1-based lecture number within its class. */
export async function lectureNumber(s: Session): Promise<number> {
  if (!s.class_id) return 1;
  return (
    (await one<{ n: number }>("SELECT COUNT(*) AS n FROM sessions WHERE class_id = ? AND started_at <= ?", [s.class_id, s.started_at]))?.n ?? 1
  );
}

// ---------- taps & presence ----------

export async function addTap(sessionId: number, actor: string, kind: string, tMs: number) {
  await run("INSERT INTO taps (session_id, device_id, kind, t_ms) VALUES (?, ?, ?, ?)", [sessionId, actor, kind, Math.round(tMs)]);
}
export async function lostTaps(sessionId: number): Promise<{ actor: string; t_ms: number }[]> {
  return all("SELECT device_id AS actor, t_ms FROM taps WHERE session_id = ? AND kind = 'lost' ORDER BY t_ms", [sessionId]);
}
export async function countLostSince(sessionId: number, sinceMs: number): Promise<number> {
  return (
    (await one<{ n: number }>("SELECT COUNT(DISTINCT device_id) AS n FROM taps WHERE session_id = ? AND kind = 'lost' AND t_ms >= ?", [
      sessionId,
      sinceMs,
    ]))?.n ?? 0
  );
}
export async function touchPresence(sessionId: number, actor: string, now: number) {
  await run(
    `INSERT INTO presence (session_id, device_id, first_seen, last_seen) VALUES (?, ?, ?, ?)
     ON CONFLICT(session_id, device_id) DO UPDATE SET last_seen = excluded.last_seen`,
    [sessionId, actor, Math.round(now), Math.round(now)],
  );
}
/** Lectures this actor was in (joined, or tapped Lost). Their own data, for their dashboard. */
export async function attendedSessionIds(actor: string): Promise<Set<number>> {
  const rows = await all<{ session_id: number }>(
    "SELECT session_id FROM presence WHERE device_id = ? UNION SELECT session_id FROM confusion_events WHERE actor = ?",
    [actor, actor],
  );
  return new Set(rows.map((r) => Number(r.session_id)));
}
export async function countPresence(sessionId: number): Promise<number> {
  return (await one<{ n: number }>("SELECT COUNT(*) AS n FROM presence WHERE session_id = ?", [sessionId]))?.n ?? 0;
}
export async function presenceCounts(sessionIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!sessionIds.length) return out;
  const rows = await all<{ session_id: number; n: number }>(
    `SELECT session_id, COUNT(*) AS n FROM presence WHERE session_id IN (${qs(sessionIds.length)}) GROUP BY session_id`,
    sessionIds,
  );
  for (const r of rows) out.set(r.session_id, r.n);
  return out;
}

// ---------- transcript ----------

export interface TranscriptSegment {
  id: number;
  session_id: number;
  start_ms: number;
  end_ms: number;
  text: string;
}
export async function addTranscript(sessionId: number, segs: { start_ms: number; end_ms: number; text: string }[]) {
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

// ======================= Lost moments & tutor threads =======================

export type EventStatus = "open" | "got_it" | "fuzzy";
export interface ConfusionEvent {
  id: number;
  session_id: number;
  actor: string;
  t_ms: number;
  last_tap_ms: number;
  concept: string;
  status: EventStatus;
  followups: number;
  closed_at_ms: number | null;
  created_at: number;
}

/** A second tap within this window reopens the same thread and counts as one confusion event. */
export const REOPEN_MS = 30_000;

/** Records a Lost tap. Returns the event (new, or the one reopened) and whether it was new. */
export async function recordLost(sessionId: number, actor: string, tMs: number): Promise<{ event: ConfusionEvent; reopened: boolean }> {
  const t = Math.round(tMs);
  const last = await one<ConfusionEvent>(
    "SELECT * FROM confusion_events WHERE session_id = ? AND actor = ? ORDER BY t_ms DESC LIMIT 1",
    [sessionId, actor],
  );
  if (last && t - last.last_tap_ms < REOPEN_MS && t >= last.t_ms) {
    await run("UPDATE confusion_events SET last_tap_ms = ?, closed_at_ms = NULL WHERE id = ?", [t, last.id]);
    return { event: { ...last, last_tap_ms: t }, reopened: true };
  }
  await addTap(sessionId, actor, "lost", t);
  const event = (await one<ConfusionEvent>(
    "INSERT INTO confusion_events (session_id, actor, t_ms, last_tap_ms, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *",
    [sessionId, actor, t, t, Date.now()],
  ))!;
  return { event, reopened: false };
}
export async function getEvent(id: number): Promise<ConfusionEvent | undefined> {
  return one<ConfusionEvent>("SELECT * FROM confusion_events WHERE id = ?", [id]);
}
export async function updateEvent(id: number, f: Partial<Pick<ConfusionEvent, "concept" | "status" | "closed_at_ms">>) {
  const keys = Object.keys(f) as (keyof typeof f)[];
  if (!keys.length) return;
  await run(`UPDATE confusion_events SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, [...keys.map((k) => f[k]), id]);
}
export async function eventsForSession(sessionId: number): Promise<ConfusionEvent[]> {
  return all<ConfusionEvent>("SELECT * FROM confusion_events WHERE session_id = ? ORDER BY t_ms", [sessionId]);
}
export async function eventsForActor(actor: string, sessionIds?: number[]): Promise<ConfusionEvent[]> {
  if (sessionIds && !sessionIds.length) return [];
  return sessionIds
    ? all<ConfusionEvent>(`SELECT * FROM confusion_events WHERE actor = ? AND session_id IN (${qs(sessionIds.length)}) ORDER BY t_ms`, [
        actor,
        ...sessionIds,
      ])
    : all<ConfusionEvent>("SELECT * FROM confusion_events WHERE actor = ? ORDER BY created_at DESC", [actor]);
}
export async function eventsForSessions(sessionIds: number[]): Promise<ConfusionEvent[]> {
  if (!sessionIds.length) return [];
  return all<ConfusionEvent>(`SELECT * FROM confusion_events WHERE session_id IN (${qs(sessionIds.length)})`, sessionIds);
}
export async function setEventConcepts(updates: { id: number; concept: string }[]) {
  for (const u of updates) await run("UPDATE confusion_events SET concept = ? WHERE id = ?", [u.concept, u.id]);
}
export async function deleteEvent(id: number) {
  await run("DELETE FROM chat_messages WHERE event_id = ?", [id]);
  await run("DELETE FROM confusion_events WHERE id = ?", [id]);
}

export type ChatKind = "lost" | "text" | "more" | "example" | "missed" | "again";
export interface ChatMessage {
  id: number;
  session_id: number;
  event_id: number | null;
  device_id: string;
  role: "user" | "assistant";
  kind: ChatKind;
  t_ms: number;
  content: string;
  created_at: number;
}
export async function addChatMessage(m: Omit<ChatMessage, "id" | "created_at">) {
  await run(
    "INSERT INTO chat_messages (session_id, event_id, device_id, role, kind, t_ms, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [m.session_id, m.event_id, m.device_id, m.role, m.kind, Math.round(m.t_ms), m.content, Date.now()],
  );
  if (m.role === "user" && m.event_id && m.kind !== "lost")
    await run("UPDATE confusion_events SET followups = followups + 1 WHERE id = ?", [m.event_id]);
}
export async function getThread(eventId: number): Promise<ChatMessage[]> {
  return all<ChatMessage>("SELECT * FROM chat_messages WHERE event_id = ? ORDER BY id", [eventId]);
}
export async function threadsForEvents(eventIds: number[]): Promise<Map<number, ChatMessage[]>> {
  const out = new Map<number, ChatMessage[]>();
  if (!eventIds.length) return out;
  const rows = await all<ChatMessage>(`SELECT * FROM chat_messages WHERE event_id IN (${qs(eventIds.length)}) ORDER BY id`, eventIds);
  for (const r of rows) out.set(r.event_id!, [...(out.get(r.event_id!) ?? []), r]);
  return out;
}
export async function recentChatCount(actor: string, sinceEpochMs: number): Promise<number> {
  return (
    (await one<{ n: number }>("SELECT COUNT(*) AS n FROM chat_messages WHERE device_id = ? AND role = 'user' AND created_at >= ?", [
      actor,
      sinceEpochMs,
    ]))?.n ?? 0
  );
}
/** Questions students typed to the tutor in one lecture (for grouping into hotspot questions). */
export async function typedQuestions(sessionId: number): Promise<{ actor: string; t_ms: number; event_t_ms: number; text: string }[]> {
  return all(
    `SELECT m.device_id AS actor, m.t_ms, e.t_ms AS event_t_ms, m.content AS text FROM chat_messages m
     JOIN confusion_events e ON e.id = m.event_id
     WHERE m.session_id = ? AND m.role = 'user' AND m.kind = 'text' ORDER BY m.t_ms`,
    [sessionId],
  );
}

// ======================= hotspots & clarifications =======================

export type HotspotStatus = "draft" | "published" | "dismissed";
export interface Hotspot {
  id: number;
  session_id: number;
  start_ms: number;
  end_ms: number;
  students: number;
  concept: string;
  excerpt: string;
  questions_json: string;
  draft: string;
  published: string;
  status: HotspotStatus;
  link_url: string;
  link_title: string;
  published_at: number | null;
  actors_json: string;
  rank: number;
}
export async function replaceHotspots(sessionId: number, hs: Omit<Hotspot, "id" | "session_id" | "published_at" | "published" | "status" | "link_url" | "link_title">[]) {
  // Keep anything the professor already published or dismissed for a time range that still exists.
  const old = await hotspotsForSession(sessionId);
  await run("DELETE FROM hotspot_views WHERE hotspot_id IN (SELECT id FROM hotspots WHERE session_id = ? AND status = 'draft')", [sessionId]);
  await run("DELETE FROM hotspots WHERE session_id = ? AND status = 'draft'", [sessionId]);
  for (const h of hs) {
    if (old.some((o) => o.status !== "draft" && o.start_ms < h.end_ms && h.start_ms < o.end_ms)) continue;
    await run(
      `INSERT INTO hotspots (session_id, start_ms, end_ms, students, concept, excerpt, questions_json, draft, actors_json, rank)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, h.start_ms, h.end_ms, h.students, h.concept, h.excerpt, h.questions_json, h.draft, h.actors_json, h.rank],
    );
  }
}
export async function hotspotsForSession(sessionId: number): Promise<Hotspot[]> {
  return all<Hotspot>("SELECT * FROM hotspots WHERE session_id = ? ORDER BY rank, start_ms", [sessionId]);
}
export async function hotspotsForSessions(sessionIds: number[]): Promise<Hotspot[]> {
  if (!sessionIds.length) return [];
  return all<Hotspot>(`SELECT * FROM hotspots WHERE session_id IN (${qs(sessionIds.length)}) ORDER BY session_id, rank`, sessionIds);
}
export async function getHotspot(id: number): Promise<Hotspot | undefined> {
  return one<Hotspot>("SELECT * FROM hotspots WHERE id = ?", [id]);
}
export async function updateHotspot(
  id: number,
  f: Partial<Pick<Hotspot, "draft" | "published" | "status" | "link_url" | "link_title" | "published_at" | "concept">>,
) {
  const keys = Object.keys(f) as (keyof typeof f)[];
  if (!keys.length) return;
  await run(`UPDATE hotspots SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, [...keys.map((k) => f[k]), id]);
}
/** A manual clarification the professor adds without a hotspot. */
export async function addManualClarification(sessionId: number, f: { concept: string; text: string; start_ms: number; link_url: string; link_title: string }) {
  await run(
    `INSERT INTO hotspots (session_id, start_ms, end_ms, students, concept, draft, published, status, link_url, link_title, published_at, rank)
     VALUES (?, ?, ?, 0, ?, ?, ?, 'published', ?, ?, ?, 999)`,
    [sessionId, f.start_ms, f.start_ms, f.concept, f.text, f.text, f.link_url, f.link_title, Date.now()],
  );
}
export async function recordHotspotView(hotspotId: number, actor: string, gotIt = false) {
  await run(
    `INSERT INTO hotspot_views (hotspot_id, actor, opened_at, got_it) VALUES (?, ?, ?, ?)
     ON CONFLICT(hotspot_id, actor) DO UPDATE SET got_it = CASE WHEN excluded.got_it = 1 THEN 1 ELSE hotspot_views.got_it END`,
    [hotspotId, actor, Date.now(), gotIt ? 1 : 0],
  );
}
export async function hotspotViews(hotspotIds: number[]): Promise<{ hotspot_id: number; actor: string; got_it: number }[]> {
  if (!hotspotIds.length) return [];
  return all(`SELECT hotspot_id, actor, got_it FROM hotspot_views WHERE hotspot_id IN (${qs(hotspotIds.length)})`, hotspotIds);
}

// ======================= audio =======================

export async function addAudioChunk(sessionId: number, runId: string, runStartMs: number, seq: number, mime: string, data: Uint8Array) {
  await run("INSERT INTO audio_chunks (session_id, run_id, run_start_ms, seq, mime, data) VALUES (?, ?, ?, ?, ?, ?)", [
    sessionId,
    runId,
    Math.round(runStartMs),
    seq,
    mime,
    usingPostgres ? Buffer.from(data) : data,
  ]);
}
export async function audioRuns(sessionId: number): Promise<{ run_id: string; run_start_ms: number; mime: string; chunks: number; bytes: number }[]> {
  return all(
    `SELECT run_id, MIN(run_start_ms) AS run_start_ms, MIN(mime) AS mime, COUNT(*) AS chunks, SUM(LENGTH(data)) AS bytes
     FROM audio_chunks WHERE session_id = ? GROUP BY run_id ORDER BY MIN(run_start_ms)`,
    [sessionId],
  ).then((rows) => rows.map((r) => ({ ...(r as object), chunks: Number((r as Row).chunks), bytes: Number((r as Row).bytes) }) as never));
}
export async function audioData(sessionId: number, runId: string): Promise<{ mime: string; data: Uint8Array } | null> {
  const rows = await all<{ mime: string; data: Uint8Array }>(
    "SELECT mime, data FROM audio_chunks WHERE session_id = ? AND run_id = ? ORDER BY seq",
    [sessionId, runId],
  );
  if (!rows.length) return null;
  const parts = rows.map((r) => new Uint8Array(r.data));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return { mime: rows[0].mime, data: out };
}
export async function deleteAudio(sessionId: number) {
  await run("DELETE FROM audio_chunks WHERE session_id = ?", [sessionId]);
}
/** End-of-term rule: audio is deleted once the class's deletion date has passed. Transcript, markers and chats stay. */
export async function purgeExpiredAudio(classId: number) {
  const c = await getClassById(classId);
  if (!c?.audio_delete_on || c.audio_delete_on > Date.now()) return;
  await run("DELETE FROM audio_chunks WHERE session_id IN (SELECT id FROM sessions WHERE class_id = ?)", [classId]);
}

// ======================= study =======================

export async function studyProgress(userId: number): Promise<Map<string, { status: string; score: number; updated_at: number }>> {
  const rows = await all<{ topic_key: string; status: string; score: number; updated_at: number }>(
    "SELECT topic_key, status, score, updated_at FROM study_progress WHERE user_id = ?",
    [userId],
  );
  return new Map(rows.map((r) => [r.topic_key, r]));
}
export async function setStudyProgress(userId: number, topicKey: string, status: string, score: number) {
  await run(
    `INSERT INTO study_progress (user_id, topic_key, status, score, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, topic_key) DO UPDATE SET status = excluded.status, score = excluded.score, updated_at = excluded.updated_at`,
    [userId, topicKey, status, score, Date.now()],
  );
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = await one<{ json: string }>("SELECT json FROM ai_cache WHERE key = ?", [key]);
  return r ? (JSON.parse(r.json) as T) : null;
}
export async function cacheSet(key: string, value: unknown) {
  await run(`INSERT INTO ai_cache (key, json, created_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json`, [
    key,
    JSON.stringify(value),
    Date.now(),
  ]);
}

// ======================= a student's own data =======================

/** The id stored in taps/chats for a signed-in user. */
export const userActorId = (userId: number) => `user-${String(userId).padStart(6, "0")}`;

/** "Delete my data": tutor threads, Lost moments, taps, study progress, prefs, memberships and the account. */
export async function deleteUserData(userId: number) {
  const actor = userActorId(userId);
  await run("DELETE FROM chat_messages WHERE device_id = ?", [actor]);
  await run("DELETE FROM confusion_events WHERE actor = ?", [actor]);
  await run("DELETE FROM taps WHERE device_id = ?", [actor]);
  await run("DELETE FROM presence WHERE device_id = ?", [actor]);
  await run("DELETE FROM hotspot_views WHERE actor = ?", [actor]);
  await run("DELETE FROM study_progress WHERE user_id = ?", [userId]);
  await run("DELETE FROM user_prefs WHERE user_id = ?", [userId]);
  await run("DELETE FROM auth_sessions WHERE user_id = ?", [userId]);
  // Classes they own keep existing; only student memberships go.
  await run("DELETE FROM memberships WHERE user_id = ? AND role <> 'instructor'", [userId]);
  const owns = await one<{ n: number }>("SELECT COUNT(*) AS n FROM memberships WHERE user_id = ?", [userId]);
  if (!owns?.n) await run("DELETE FROM users WHERE id = ?", [userId]);
}
