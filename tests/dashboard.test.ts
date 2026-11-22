import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A throwaway SQLite database for this file.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lf-dash-"));
process.env.DB_PATH = path.join(dir, "test.db");
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GROQ_API_KEY;

type Db = typeof import("../lib/db");
type Views = typeof import("../lib/views");
let db: Db;
let views: Views;

beforeAll(async () => {
  db = await import("../lib/db");
  views = await import("../lib/views");
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("student dashboard", () => {
  it("counts only the student's own lectures and Lost moments", async () => {
    const prof = await db.upsertUser("prof@uw.edu", "Prof");
    const ana = await db.upsertUser("ana@uw.edu", "Ana Lee");
    const ben = await db.upsertUser("ben@uw.edu", "Ben");
    const c = await db.createClass("CSE 143 · Programming II", "Autumn", prof.id);
    await db.addMembership(c.id, ana.id, "student");
    await db.addMembership(c.id, ben.id, "student");

    const s1 = await db.createSession("Recursion", c.name, Date.now() - 3 * 3_600_000, { classId: c.id, createdBy: prof.id });
    const s2 = await db.createSession("Stacks", c.name, Date.now() - 2 * 3_600_000, { classId: c.id, createdBy: prof.id });
    const a = db.userActorId(ana.id);
    const b = db.userActorId(ben.id);
    await db.touchPresence(s1.id, a, 1_000);
    await db.touchPresence(s2.id, a, 1_000);
    await db.touchPresence(s1.id, b, 1_000);
    // Ana: lost 3 times in lecture 1 (one marked got it), never in lecture 2. Ben: lost once.
    const e1 = await db.recordLost(s1.id, a, 60_000);
    await db.recordLost(s1.id, a, 300_000);
    await db.recordLost(s1.id, a, 900_000);
    await db.updateEvent(e1.event.id, { status: "got_it" });
    await db.recordLost(s1.id, b, 60_000);
    await db.endSession(s1.id);
    await db.endSession(s2.id);

    const d = await views.studentDashboard(ana);
    expect(d.first_name).toBe("Ana");
    expect(d.totals).toMatchObject({ lectures: 2, lost: 3, got_it: 1 });
    const byTitle = Object.fromEntries(d.recent.map((l) => [l.title, l.lost]));
    expect(byTitle).toEqual({ Recursion: 3, Stacks: 0 });
    // Nothing about Ben leaks into Ana's dashboard.
    expect(JSON.stringify(d)).not.toContain("ben@uw.edu");
    expect(JSON.stringify(d)).not.toContain(b);

    const dBen = await views.studentDashboard(ben);
    expect(dBen.totals).toMatchObject({ lectures: 1, lost: 1 });
  });

  it("leaves the student sections empty for someone who only teaches", async () => {
    const prof = await db.upsertUser("prof@uw.edu", "");
    const d = await views.studentDashboard(prof);
    expect(d.totals.lectures).toBe(0);
    expect(d.recent).toEqual([]);
    expect(d.classes.every((c) => c.role === "instructor")).toBe(true);
  });
});
