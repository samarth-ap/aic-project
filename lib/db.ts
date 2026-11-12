// SQLite storage using Node's built-in `node:sqlite` (Node 22.5+), so there is
// no native dependency to compile. One file on disk: data/lostfound.db.
//
// For a hosted deploy where the filesystem is ephemeral (e.g. Vercel), swap
// this module for Postgres/Supabase — every query in the app goes through the
// functions exported here.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
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

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "lostfound.db");

let _db: DatabaseSync | null = null;
export function db(): DatabaseSync {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new DatabaseSync(DB_PATH);
  _db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      admin_key TEXT NOT NULL,
      title TEXT NOT NULL,
      course TEXT NOT NULL DEFAULT '',
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS taps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id),
      device_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      t_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS taps_session ON taps(session_id, t_ms);
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id),
      device_id TEXT NOT NULL,
      t_ms INTEGER NOT NULL,
      text TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transcript (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id),
      start_ms INTEGER NOT NULL,
      end_ms INTEGER NOT NULL,
      text TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS transcript_session ON transcript(session_id, start_ms);
    CREATE TABLE IF NOT EXISTS presence (
      session_id INTEGER NOT NULL REFERENCES sessions(id),
      device_id TEXT NOT NULL,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      PRIMARY KEY (session_id, device_id)
    );
    CREATE TABLE IF NOT EXISTS reports (
      session_id INTEGER PRIMARY KEY REFERENCES sessions(id),
      json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  return _db;
}

function newCode(): string {
  // 6 chars, no look-alikes (0/O, 1/I/L)
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function createSession(title: string, course: string, startedAt = Date.now()): Session {
  const code = newCode();
  const adminKey = crypto.randomBytes(16).toString("hex");
  const info = db()
    .prepare("INSERT INTO sessions (code, admin_key, title, course, started_at) VALUES (?, ?, ?, ?, ?)")
    .run(code, adminKey, title, course, startedAt);
  return getSessionById(Number(info.lastInsertRowid))!;
}

export function getSessionById(id: number): Session | undefined {
  return db().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Session | undefined;
}
export function getSession(code: string): Session | undefined {
  return db().prepare("SELECT * FROM sessions WHERE code = ?").get(code.toUpperCase()) as
    | Session
    | undefined;
}
export function listSessions(course?: string): Session[] {
  return (
    course
      ? db().prepare("SELECT * FROM sessions WHERE course = ? ORDER BY started_at").all(course)
      : db().prepare("SELECT * FROM sessions ORDER BY started_at").all()
  ) as unknown as Session[];
}
export function endSession(id: number, endedAt = Date.now()) {
  db().prepare("UPDATE sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL").run(endedAt, id);
}

export function addTap(sessionId: number, deviceId: string, kind: TapKind, tMs: number) {
  db().prepare("INSERT INTO taps (session_id, device_id, kind, t_ms) VALUES (?, ?, ?, ?)").run(
    sessionId,
    deviceId,
    kind,
    tMs,
  );
}
export function lastTapMs(sessionId: number, deviceId: string): number | null {
  const row = db()
    .prepare("SELECT MAX(t_ms) AS t FROM taps WHERE session_id = ? AND device_id = ?")
    .get(sessionId, deviceId) as { t: number | null };
  return row.t;
}
export function getTaps(sessionId: number): Tap[] {
  return db().prepare("SELECT * FROM taps WHERE session_id = ? ORDER BY t_ms").all(sessionId) as unknown as Tap[];
}

export function addQuestion(sessionId: number, deviceId: string, tMs: number, text: string) {
  db().prepare("INSERT INTO questions (session_id, device_id, t_ms, text) VALUES (?, ?, ?, ?)").run(
    sessionId,
    deviceId,
    tMs,
    text,
  );
}
export function getQuestions(sessionId: number): Question[] {
  return db()
    .prepare("SELECT * FROM questions WHERE session_id = ? ORDER BY t_ms")
    .all(sessionId) as unknown as Question[];
}

export function addTranscript(sessionId: number, segs: { start_ms: number; end_ms: number; text: string }[]) {
  const stmt = db().prepare("INSERT INTO transcript (session_id, start_ms, end_ms, text) VALUES (?, ?, ?, ?)");
  for (const s of segs) stmt.run(sessionId, Math.round(s.start_ms), Math.round(s.end_ms), s.text);
}
export function clearTranscript(sessionId: number) {
  db().prepare("DELETE FROM transcript WHERE session_id = ?").run(sessionId);
}
export function getTranscript(sessionId: number): TranscriptSegment[] {
  return db()
    .prepare("SELECT * FROM transcript WHERE session_id = ? ORDER BY start_ms")
    .all(sessionId) as unknown as TranscriptSegment[];
}

/** Student page heartbeat; `now` is ms since session start. */
export function touchPresence(sessionId: number, deviceId: string, now: number) {
  db()
    .prepare(
      `INSERT INTO presence (session_id, device_id, first_seen, last_seen) VALUES (?, ?, ?, ?)
       ON CONFLICT(session_id, device_id) DO UPDATE SET last_seen = excluded.last_seen`,
    )
    .run(sessionId, deviceId, now, now);
}
export function countPresence(sessionId: number, sinceMs?: number): number {
  const row = (
    sinceMs === undefined
      ? db().prepare("SELECT COUNT(*) AS n FROM presence WHERE session_id = ?").get(sessionId)
      : db().prepare("SELECT COUNT(*) AS n FROM presence WHERE session_id = ? AND last_seen >= ?").get(sessionId, sinceMs)
  ) as { n: number };
  return row.n;
}

export function saveReport(sessionId: number, report: unknown) {
  db()
    .prepare("INSERT OR REPLACE INTO reports (session_id, json, created_at) VALUES (?, ?, ?)")
    .run(sessionId, JSON.stringify(report), Date.now());
}
export function getReport<T>(sessionId: number): T | null {
  const row = db().prepare("SELECT json FROM reports WHERE session_id = ?").get(sessionId) as
    | { json: string }
    | undefined;
  return row ? (JSON.parse(row.json) as T) : null;
}
