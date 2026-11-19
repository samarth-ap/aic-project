// Seeds a demo: CSE 143 with 12 lectures, ~96 students, Lost taps, tutor
// threads, hotspots and clarifications, plus a demo student with their own
// moments.   npm run seed   (replaces the local SQLite database)
//
// Sign in with the email code (shown on screen in dev mode):
//   professor: prof@uw.edu      student: student@uw.edu
import fs from "node:fs";
import path from "node:path";
import { LECTURES, MY_MOMENTS, type DemoLecture } from "./data/cse143";

const mmss = (s: string) => {
  const [m, sec] = s.split(":").map(Number);
  return (m * 60 + sec) * 1000;
};
let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T,>(xs: T[], n: number) => [...xs].sort(() => rand() - 0.5).slice(0, n);
const at1030 = (date: string) => new Date(`${date}T10:30:00`).getTime();

async function main() {
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
    if (!process.argv.includes("--force")) throw new Error("DATABASE_URL is set. The seed adds demo data to that database; run with --force if you mean it.");
  } else {
    const file = process.env.DB_PATH ?? path.join(process.cwd(), "data", "lostfound.db");
    for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
    console.log(`Reset ${path.relative(process.cwd(), file)}`);
  }
  // Import after the reset so the schema is created fresh.
  const db = await import("../lib/db");
  const { processLecture, hashActor } = await import("../lib/analysis/lecture");
  const { aiProvider } = await import("../lib/analysis/llm");
  const ai = aiProvider();
  console.log(`AI: ${ai ?? "off (set ANTHROPIC_API_KEY or GROQ_API_KEY for AI concept maps and drafts)"}`);

  // ---------- people ----------
  const prof = await db.upsertUser("prof@uw.edu", "Demo Professor");
  await db.setUserKind(prof.id, "professor");
  const me = await db.upsertUser("student@uw.edu", "Demo Student");
  const others = [];
  for (let i = 1; i <= 95; i++) others.push(await db.upsertUser(`student${String(i).padStart(3, "0")}@uw.edu`, `Student ${i}`));
  const meActor = db.userActorId(me.id);

  // ---------- classes ----------
  const now = Date.now();
  const cse = await db.createClass("CSE 143 · Computer Programming II", "Autumn term", prof.id, new Date("2026-12-18T12:00:00").getTime());
  await db.updateClass(cse.id, { exam_name: "Midterm", exam_date: now + 9 * 86_400_000, graded_notes: "Homework 6 (recursive maze solver)" });
  await db.createClass("CSE 373 · Data Structures and Algorithms", "Autumn term", prof.id);
  for (const u of [me, ...others]) await db.addMembership(cse.id, u.id, "student");

  // ---------- lectures ----------
  for (const [i, L] of LECTURES.entries()) {
    const no = i + 1;
    const s = await seedLecture(L, cse.id, cse.name, [me, ...others], no, true);
    process.stdout.write(`L${no} ${L.title}: `);
    await processLecture(s.id);
    await finishHotspots(s.id, L);
    const hs = await db.hotspotsForSession(s.id);
    console.log(`${hs.filter((h) => h.students > 0).length} hotspots`);
  }

  // Two other classes on the demo student's list.
  const other = await db.upsertUser("prof2@uw.edu", "Second Professor");
  for (const [name, title, lines, concepts] of [
    ["MATH 126 · Calculus III", "Partial derivatives", [["0:30", "Today: partial derivatives. Hold every variable fixed except one, then differentiate as usual."], ["12:00", "The gradient collects all the partial derivatives into one vector. It points uphill."], ["25:00", "Directional derivatives: dot the gradient with a unit vector in the direction you care about."]], ["Partial derivatives", "Gradient", "Directional derivatives"]],
    ["PHYS 122 · Electromagnetism", "Electric fields", [["0:40", "An electric field tells you the force a small positive charge would feel at each point."], ["14:00", "Field lines start on positive charges and end on negative ones. Closer lines mean a stronger field."], ["28:00", "Superposition: the total field is the vector sum of the fields from each charge."]], ["Electric field", "Field lines", "Superposition"]],
  ] as [string, string, [string, string][], string[]][]) {
    const c = await db.createClass(name, "Autumn term", other.id);
    await db.addMembership(c.id, me.id, "student");
    const L: DemoLecture = { title, date: "2026-11-10", joined: 40, lostShare: 0.2, concepts: lines.map(([t], k) => [concepts[k], t]), lines, hotspots: [] };
    const s = await seedLecture(L, c.id, c.name, [me, ...others.slice(0, 39)], 1);
    const { event } = await db.recordLost(s.id, meActor, mmss("13:10"));
    await db.updateEvent(event.id, { status: "fuzzy", closed_at_ms: mmss("13:40") });
    await processLecture(s.id);
  }

  console.log(`
Done. Start the app (npm run dev) and sign in with an email code (shown on screen in dev mode):
  professor  prof@uw.edu     -> /teach
  student    student@uw.edu  -> /app
To see the live flow: as the professor, open CSE 143 and press "Start lecture"; as the student (another browser or phone), join with code ${cse.code}.`);

  async function seedLecture(L: DemoLecture, classId: number, className: string, people: { id: number }[], no: number, withMine = false) {
    const start = at1030(L.date);
    const dur = 50 * 60_000;
    const s = await db.createSession(L.title, className, start, { classId, createdBy: prof.id });
    const joined = [people[0], ...pick(people.slice(1), L.joined - 1)].map((u) => db.userActorId(u.id));
    for (const a of joined) await db.touchPresence(s.id, a, Math.floor(rand() * 120_000));
    await db.addTranscript(
      s.id,
      L.lines.map(([t, text], k) => ({ start_ms: mmss(t), end_ms: L.lines[k + 1] ? mmss(L.lines[k + 1][0]) : mmss(t) + 25_000, text })),
    );
    await db.setSessionFields(s.id, {
      summary_json: JSON.stringify({ summary: "", concepts: L.concepts.map(([name, t]) => ({ name: name.toLowerCase(), start_ms: mmss(t) })) }),
      summary_at: start + dur,
    });

    const crowd = joined.filter((a) => a !== meActor);
    const lostActors = new Set<string>();
    for (const h of L.hotspots) {
      const group = pick(crowd, h.students);
      const qs = (h.questions ?? []).flatMap(([q, n]) => Array.from({ length: n }, () => q));
      for (const [k, a] of group.entries()) {
        const t = mmss(h.at) + Math.floor(rand() * (h.spread ?? 50) * 1000);
        const { event } = await db.recordLost(s.id, a, t);
        lostActors.add(a);
        await db.addChatMessage({ session_id: s.id, event_id: event.id, device_id: a, role: "user", kind: "lost", t_ms: t, content: "[Tapped Lost]" });
        await db.addChatMessage({ session_id: s.id, event_id: event.id, device_id: a, role: "assistant", kind: "text", t_ms: t + 2000, content: h.draft });
        if (qs[k]) {
          await db.addChatMessage({ session_id: s.id, event_id: event.id, device_id: a, role: "user", kind: "text", t_ms: t + 20_000, content: qs[k] });
          await db.addChatMessage({ session_id: s.id, event_id: event.id, device_id: a, role: "assistant", kind: "text", t_ms: t + 22_000, content: "Good question. Look at the smallest input your method can get and answer that one directly." });
        }
        const r = rand();
        await db.updateEvent(event.id, {
          status: r < 0.5 ? "got_it" : r < 0.82 ? "open" : r < 0.94 ? "fuzzy" : "open",
          closed_at_ms: r < 0.94 ? t + 15_000 + Math.floor(rand() * 60_000) : null,
        });
      }
    }
    // Scattered single taps up to the lecture's "lost at least once" share.
    const target = Math.round(L.lostShare * L.joined);
    for (const a of pick(crowd.filter((x) => !lostActors.has(x)), Math.max(0, target - lostActors.size))) {
      const t = Math.floor(rand() * (dur - 120_000)) + 60_000;
      const { event } = await db.recordLost(s.id, a, t);
      await db.updateEvent(event.id, { status: rand() < 0.6 ? "got_it" : "open", closed_at_ms: t + 20_000 });
    }

    // The demo student's own moments.
    for (const m of MY_MOMENTS.filter((x) => withMine && x.lecture === no)) {
      const t = mmss(m.at);
      const { event } = await db.recordLost(s.id, meActor, t);
      await db.addChatMessage({ session_id: s.id, event_id: event.id, device_id: meActor, role: "user", kind: "lost", t_ms: t, content: `[Tapped Lost at ${m.at}]` });
      const concept = m.answer.match(/^\[\[(.+?)\]\]/)?.[1] ?? "";
      await db.addChatMessage({ session_id: s.id, event_id: event.id, device_id: meActor, role: "assistant", kind: "text", t_ms: t + 2500, content: m.answer.replace(/^\[\[.+?\]\]\n/, "") });
      for (const [q, a] of m.followups ?? []) {
        await db.addChatMessage({ session_id: s.id, event_id: event.id, device_id: meActor, role: "user", kind: "text", t_ms: t + 30_000, content: q });
        await db.addChatMessage({ session_id: s.id, event_id: event.id, device_id: meActor, role: "assistant", kind: "text", t_ms: t + 33_000, content: a });
      }
      await db.updateEvent(event.id, { concept: concept.charAt(0).toUpperCase() + concept.slice(1), status: m.status, closed_at_ms: t + 40_000 });
    }
    await db.endSession(s.id, start + dur);
    return (await db.getSessionById(s.id))!;
  }

  async function finishHotspots(sessionId: number, L: DemoLecture) {
    const hs = await db.hotspotsForSession(sessionId);
    const ins = (await db.getSessionById(sessionId))!;
    for (const h of hs) {
      const spec = L.hotspots.find((x) => mmss(x.at) >= h.start_ms - 60_000 && mmss(x.at) <= h.end_ms);
      if (!spec) continue;
      await db.updateHotspot(h.id, {
        concept: spec.concept,
        draft: ai && spec.status === "draft" ? h.draft || spec.draft : spec.draft,
        status: spec.status,
        published: spec.status === "published" ? spec.draft : "",
        published_at: spec.status === "published" ? ins.ended_at! + 20 * 3_600_000 : null,
        link_url: spec.link?.[0] ?? "",
        link_title: spec.link?.[1] ?? "",
      });
      if (spec.status !== "published") continue;
      // Some of the class opened the clarification; most of those who were lost marked it "Got it".
      const lost = new Set<string>(JSON.parse(h.actors_json));
      const present = await db.eventsForSession(sessionId);
      const actors = [...new Set(present.map((e) => e.actor))];
      for (const a of actors) {
        const wasLost = lost.has(hashActor(a));
        if (rand() < (wasLost ? 0.86 : 0.45)) await db.recordHotspotView(h.id, a, wasLost && rand() < 0.79);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
