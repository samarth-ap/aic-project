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
  class_id: number | null;
  created_by: number | null;
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

    -- ---------- accounts & classes ----------
    CREATE TABLE IF NOT EXISTS users (
      id ${id},
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      picture TEXT NOT NULL DEFAULT '',
      created_at ${big} NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,   -- sha256 of the cookie value; the raw token is never stored
      user_id ${ref} NOT NULL REFERENCES users(id),
      created_at ${big} NOT NULL,
      expires_at ${big} NOT NULL
    );
    CREATE TABLE IF NOT EXISTS classes (
      id ${id},
      code TEXT UNIQUE NOT NULL,        -- students join with this
      staff_code TEXT UNIQUE NOT NULL,  -- TAs join with this
      name TEXT NOT NULL,
      term TEXT NOT NULL DEFAULT '',
      allow_guests INTEGER NOT NULL DEFAULT 1,  -- 1: students can tap without signing in
      created_by ${ref} REFERENCES users(id),
      created_at ${big} NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memberships (
      class_id ${ref} NOT NULL REFERENCES classes(id),
      user_id ${ref} NOT NULL REFERENCES users(id),
      role TEXT NOT NULL,               -- 'instructor' | 'ta' | 'student'
      joined_at ${big} NOT NULL,
      PRIMARY KEY (class_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS memberships_user ON memberships(user_id);
    CREATE TABLE IF NOT EXISTS study_plans (
      user_id ${ref} NOT NULL REFERENCES users(id),
      class_id ${ref} NOT NULL REFERENCES classes(id),
      json TEXT NOT NULL,
      created_at ${big} NOT NULL,
      PRIMARY KEY (user_id, class_id)
    );
  `;
}

/** Columns added after the first release. Safe to run on every cold start. */
async function migrate(d: Driver, pg: boolean) {
  const big = pg ? "BIGINT" : "INTEGER";
  const cols: [string, string, string][] = [
    ["sessions", "class_id", big],
    ["sessions", "created_by", big],
  ];
  for (const [table, col, type] of cols) {
    if (pg) await d.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`);
    else await d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`).catch(() => {}); // "duplicate column" = already there
  }
  await d.exec("CREATE INDEX IF NOT EXISTS sessions_class ON sessions(class_id, started_at)");
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
      const setup = async () => {
        await d.exec(schema(Boolean(PG_URL)));
        await migrate(d, Boolean(PG_URL));
      };
      try {
        await setup();
      } catch (e) {
        // Two cold starts creating tables at the same moment can race; the second try sees them.
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
  for (const k of ["id", "session_id", "class_id", "user_id", "created_by", "allow_guests"])
    if (k in r && r[k] != null) (r as Row)[k] = Number(r[k]);
  return r;
};

function newCode(): string {
  // 6 chars, no look-alikes (0/O, 1/I/L)
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function createSession(
  title: string,
  course: string,
  startedAt = Date.now(),
  opts: { classId?: number | null; createdBy?: number | null } = {},
): Promise<Session> {
  const adminKey = crypto.randomBytes(16).toString("hex");
  // Codes are random; retry on the (very unlikely) collision.
  for (let attempt = 0; ; attempt++) {
    try {
      const row = await one<Session>(
        "INSERT INTO sessions (code, admin_key, title, course, started_at, class_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *",
        [newCode(), adminKey, title, course, startedAt, opts.classId ?? null, opts.createdBy ?? null],
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

// ---------- accounts ----------

export interface User {
  id: number;
  email: string;
  name: string;
  picture: string;
  created_at: number;
}
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
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Creates or updates a user. A blank name keeps the existing one (new users get their NetID). */
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
  return num((await one<User>("SELECT * FROM users WHERE email = ?", [e]))! as unknown as Row) as unknown as User;
}

/** Creates a login session; returns the raw token for the cookie (only its hash is stored). */
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
  const row = await one<User>(
    `SELECT u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    [sha256(token), Date.now()],
  );
  return row ? (num(row as unknown as Row) as unknown as User) : null;
}
export async function deleteAuthSession(token: string) {
  await run("DELETE FROM auth_sessions WHERE token_hash = ?", [sha256(token)]);
}

// ---------- classes ----------

function classCode(len: number): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(len), (b) => alphabet[b % alphabet.length]).join("");
}
const toClass = (r: unknown) => num(r as Row) as unknown as Class;

export async function createClass(name: string, term: string, userId: number): Promise<Class> {
  for (let attempt = 0; ; attempt++) {
    try {
      const c = toClass(
        await one(
          "INSERT INTO classes (code, staff_code, name, term, allow_guests, created_by, created_at) VALUES (?, ?, ?, ?, 1, ?, ?) RETURNING *",
          [classCode(6), "T" + classCode(7), name, term, userId, Date.now()],
        ),
      );
      await addMembership(c.id, userId, "instructor");
      return c;
    } catch (e) {
      if (attempt >= 3) throw e;
    }
  }
}
export async function getClassByCode(code: string): Promise<Class | undefined> {
  const r = await one("SELECT * FROM classes WHERE code = ?", [code.trim().toUpperCase()]);
  return r ? toClass(r) : undefined;
}
export async function getClassByStaffCode(code: string): Promise<Class | undefined> {
  const r = await one("SELECT * FROM classes WHERE staff_code = ?", [code.trim().toUpperCase()]);
  return r ? toClass(r) : undefined;
}
export async function getClassById(id: number): Promise<Class | undefined> {
  const r = await one("SELECT * FROM classes WHERE id = ?", [id]);
  return r ? toClass(r) : undefined;
}
export async function updateClass(id: number, fields: { name?: string; term?: string; allow_guests?: boolean }) {
  const c = await getClassById(id);
  if (!c) return;
  await run("UPDATE classes SET name = ?, term = ?, allow_guests = ? WHERE id = ?", [
    fields.name ?? c.name,
    fields.term ?? c.term,
    fields.allow_guests === undefined ? c.allow_guests : fields.allow_guests ? 1 : 0,
    id,
  ]);
}

const ROLE_RANK: Record<Role, number> = { student: 0, ta: 1, instructor: 2 };
/** Adds a member; never downgrades an existing role (a TA who joins with the student code stays a TA). */
export async function addMembership(classId: number, userId: number, role: Role) {
  const cur = await getRole(classId, userId);
  if (cur && ROLE_RANK[cur] >= ROLE_RANK[role]) return;
  await run(
    `INSERT INTO memberships (class_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(class_id, user_id) DO UPDATE SET role = excluded.role`,
    [classId, userId, role, Date.now()],
  );
}
export async function getRole(classId: number, userId: number): Promise<Role | null> {
  const r = await one<{ role: Role }>("SELECT role FROM memberships WHERE class_id = ? AND user_id = ?", [classId, userId]);
  return r?.role ?? null;
}
export async function classesForUser(userId: number): Promise<(Class & { role: Role })[]> {
  const rows = await all<Class & { role: Role }>(
    `SELECT c.*, m.role FROM memberships m JOIN classes c ON c.id = m.class_id
     WHERE m.user_id = ? ORDER BY c.created_at DESC`,
    [userId],
  );
  return rows.map((r) => num(r as unknown as Row) as unknown as Class & { role: Role });
}
/** Names only, for staff. Never joined with taps or chats. */
export async function roster(classId: number): Promise<{ name: string; email: string; role: Role; joined_at: number }[]> {
  return all(
    `SELECT u.name, u.email, m.role, m.joined_at FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.class_id = ? ORDER BY CASE m.role WHEN 'instructor' THEN 0 WHEN 'ta' THEN 1 ELSE 2 END, u.name`,
    [classId],
  );
}
export async function sessionsForClass(classId: number): Promise<Session[]> {
  const rows = await all<Session>("SELECT * FROM sessions WHERE class_id = ? ORDER BY started_at DESC", [classId]);
  return rows.map((r) => num(r as unknown as Row) as unknown as Session);
}

// ---------- a signed-in student's own activity ----------

/** The id stored in taps/chats for a signed-in user, in place of a random device id. */
export const userActorId = (userId: number) => `user-${String(userId).padStart(6, "0")}`;

/** This actor's tap counts per lecture, for their own dashboard. */
export async function myTapCounts(actor: string, sessionIds: number[]): Promise<Map<number, Record<string, number>>> {
  const out = new Map<number, Record<string, number>>();
  if (!sessionIds.length) return out;
  const rows = await all<{ session_id: number; kind: string; n: number }>(
    `SELECT session_id, kind, COUNT(*) AS n FROM taps WHERE device_id = ? AND session_id IN (${sessionIds.map(() => "?").join(", ")})
     GROUP BY session_id, kind`,
    [actor, ...sessionIds],
  );
  for (const r of rows) {
    const id = Number(r.session_id);
    out.set(id, { ...(out.get(id) ?? {}), [r.kind]: Number(r.n) });
  }
  return out;
}
export async function myChatCounts(actor: string, sessionIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!sessionIds.length) return out;
  const rows = await all<{ session_id: number; n: number }>(
    `SELECT session_id, COUNT(*) AS n FROM chat_messages WHERE device_id = ? AND role = 'user' AND session_id IN (${sessionIds
      .map(() => "?")
      .join(", ")}) GROUP BY session_id`,
    [actor, ...sessionIds],
  );
  for (const r of rows) out.set(Number(r.session_id), Number(r.n));
  return out;
}
/** Lectures this actor took part in (tapped, chatted or was present), newest first. */
export async function sessionsForActor(actor: string): Promise<Session[]> {
  const rows = await all<Session>(
    `SELECT * FROM sessions WHERE id IN (
       SELECT session_id FROM presence WHERE device_id = ?
       UNION SELECT session_id FROM taps WHERE device_id = ?
       UNION SELECT session_id FROM chat_messages WHERE device_id = ?
     ) ORDER BY started_at DESC`,
    [actor, actor, actor],
  );
  return rows.map((r) => num(r as unknown as Row) as unknown as Session);
}
export async function saveStudyPlan(userId: number, classId: number, plan: unknown) {
  await run(
    `INSERT INTO study_plans (user_id, class_id, json, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, class_id) DO UPDATE SET json = excluded.json, created_at = excluded.created_at`,
    [userId, classId, JSON.stringify(plan), Date.now()],
  );
}
export async function getStudyPlan<T>(userId: number, classId: number): Promise<{ plan: T; created_at: number } | null> {
  const r = await one<{ json: string; created_at: number }>("SELECT json, created_at FROM study_plans WHERE user_id = ? AND class_id = ?", [
    userId,
    classId,
  ]);
  return r ? { plan: JSON.parse(r.json) as T, created_at: Number(r.created_at) } : null;
}
/** What this actor typed to the AI tutor in these lectures (for their own study plan only). */
export async function myTutorQuestions(actor: string, sessionIds: number[]): Promise<{ session_id: number; text: string }[]> {
  if (!sessionIds.length) return [];
  const rows = await all<{ session_id: number; text: string }>(
    `SELECT session_id, content AS text FROM chat_messages
     WHERE device_id = ? AND role = 'user' AND kind = 'text' AND session_id IN (${sessionIds.map(() => "?").join(", ")})
     ORDER BY id DESC LIMIT 40`,
    [actor, ...sessionIds],
  );
  return rows.map((r) => ({ session_id: Number(r.session_id), text: r.text }));
}
