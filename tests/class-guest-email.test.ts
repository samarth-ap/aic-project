import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { canSetClassGuestSignIn } from "../lib/access";

const { cookieValues } = vi.hoisted(() => ({ cookieValues: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieValues.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (name: string, value: string) => cookieValues.set(name, value),
    delete: (name: string) => cookieValues.delete(name),
  }),
}));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lf-guest-"));
let db: typeof import("../lib/db");
let auth: typeof import("../lib/auth");
let server: typeof import("../lib/server");
let instructor: import("../lib/db").User;

beforeAll(async () => {
  process.env.DB_PATH = path.join(dir, "test.db");
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  db = await import("../lib/db");
  auth = await import("../lib/auth");
  server = await import("../lib/server");
  instructor = await db.upsertUser("prof@uw.edu", "Professor");
});
beforeEach(() => {
  vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "uw.edu");
  vi.stubEnv("ENABLE_CLASS_GUEST_EMAILS", "1");
  cookieValues.clear();
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

async function inviteClass(allowGuests: boolean) {
  const cls = await db.createClass("Guest test", "", instructor.id);
  if (allowGuests) await db.updateClass(cls.id, { allow_guests: 1 });
  return cls;
}

describe("class guest email sign-in", () => {
  it("uses both the deployment and instructor controls", async () => {
    const open = await inviteClass(true);
    const closed = await inviteClass(false);
    const guest = "new@example.com";
    expect(canSetClassGuestSignIn("instructor")).toBe(true);
    expect(canSetClassGuestSignIn("ta")).toBe(false);
    expect(await auth.emailSignInAllowed(guest, "/home")).toBe(false);
    expect(await auth.emailSignInAllowed(guest, `/join/${closed.code}`)).toBe(false);
    expect(await auth.emailSignInAllowed(guest, `/join/${open.code}`)).toBe(true);

    vi.stubEnv("ENABLE_CLASS_GUEST_EMAILS", "0");
    expect(canSetClassGuestSignIn("instructor")).toBe(false);
    expect(await auth.emailSignInAllowed(guest, `/join/${open.code}`)).toBe(false);
    expect(await auth.emailSignInAllowed("student@uw.edu", "/home")).toBe(true);
  });

  it("enrolls verified guests as students and scopes classroom access", async () => {
    const open = await inviteClass(true);
    const closed = await inviteClass(false);
    const guest = "joined@example.com";
    await auth.signInVerifiedEmail(guest, `/join/${open.code}`);
    const user = (await auth.currentUser())!;
    expect(user.email).toBe(guest);
    expect(await db.getRole(open.id, user.id)).toBe("student");
    expect(await db.addMembership(open.id, user.id, "ta")).toBe(false);
    expect(await db.addMembership(closed.id, user.id, "student")).toBe(false);
    expect((await db.classesForUser(user.id)).map((c) => c.id)).toEqual([open.id]);

    const lecture = await db.createSession("Open lecture", open.name, Date.now(), { classId: open.id });
    const restricted = await db.createSession("Restricted lecture", closed.name, Date.now(), { classId: closed.id });
    expect(await server.lectureAccess(lecture.code, user, { enroll: true })).toMatchObject({ role: "student", staff: false });
    expect(await server.lectureAccess(restricted.code, user, { enroll: true })).toBeNull();
  });

  it("allows a return visit and rechecks a signed-in guest when access changes", async () => {
    const open = await inviteClass(true);
    const guest = "returning@example.com";
    await auth.signInVerifiedEmail(guest, `/join/${open.code}`);
    const user = (await auth.currentUser())!;
    expect(await auth.emailSignInAllowed(guest, "/home")).toBe(true);

    await db.updateClass(open.id, { allow_guests: 0 });
    expect(await auth.currentUser()).toBeNull();
    expect(await db.getRole(open.id, user.id)).toBeNull();
    expect(await auth.emailSignInAllowed(guest, "/home")).toBe(false);

    await db.updateClass(open.id, { allow_guests: 1 });
    vi.stubEnv("ENABLE_CLASS_GUEST_EMAILS", "0");
    expect(await auth.currentUser()).toBeNull();
    expect(await db.getRole(open.id, user.id)).toBeNull();
    expect(await db.getRole(open.id, instructor.id)).toBe("instructor");
  });

  it("checks the class again when an email is verified", async () => {
    const open = await inviteClass(true);
    const guest = "verification@example.com";
    const next = `/join/${open.code}`;
    expect(await auth.emailSignInAllowed(guest, next)).toBe(true);
    await db.updateClass(open.id, { allow_guests: 0 });
    await expect(auth.signInVerifiedEmail(guest, next)).rejects.toBeInstanceOf(auth.LoginError);
    expect(await db.getUserByEmail(guest)).toBeUndefined();
    expect(await auth.currentUser()).toBeNull();
  });
});
