// Runs a simulated live lecture in a seeded class: replays a demo transcript in
// real time and has classmates tap Lost around its hotspots, so you can try the
// student app (and the professor's live screen) without a microphone.
//
//   npm run simulate                 # CSE 143, starts 20 minutes into "Recursion and the call stack"
//   npm run simulate -- --at 5 --class K7M2QP
//
// Stop it with Ctrl+C; the lecture is ended and processed like a real one.
import { LECTURES } from "./data/cse143";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const mmss = (s: string) => {
  const [m, sec] = s.split(":").map(Number);
  return (m * 60 + sec) * 1000;
};

async function main() {
  const db = await import("../lib/db");
  const { processLecture } = await import("../lib/analysis/lecture");
  const { refreshSummary } = await import("../lib/analysis/live");
  const atMin = Number(arg("at", "20"));
  const L = LECTURES[LECTURES.length - 1];

  const prof = await db.upsertUser("prof@uw.edu", "");
  const classes = (await db.classesForUser(prof.id)).filter((c) => c.role === "instructor");
  const cls = classes.find((c) => c.code === arg("class", "").toUpperCase()) ?? classes.find((c) => c.name.startsWith("CSE 143")) ?? classes[0];
  if (!cls) throw new Error("No class found. Run npm run seed first.");
  const started = Date.now() - atMin * 60_000;
  const s = await db.createSession(`${L.title} (live demo)`, cls.name, started, { classId: cls.id, createdBy: prof.id });
  const students = (await db.roster(cls.id)).filter((p) => p.role === "student" && p.email !== "student@uw.edu");
  const actors = students.map((p) => db.userActorId(p.user_id));
  for (const a of actors.slice(0, 80)) await db.touchPresence(s.id, a, Math.random() * 60_000);

  const lines = L.lines.map(([t, text], i) => ({ start_ms: mmss(t), end_ms: L.lines[i + 1] ? mmss(L.lines[i + 1][0]) : mmss(t) + 25_000, text }));
  const past = lines.filter((l) => l.start_ms <= atMin * 60_000);
  await db.addTranscript(s.id, past);
  // The demo's concept list stands in for the AI's running summary (the AI refreshes it when a key is set).
  const concepts = (t: number) => L.concepts.filter(([, at]) => mmss(at) <= t).map(([name, at]) => ({ name: name.toLowerCase(), start_ms: mmss(at) }));
  await db.setSessionFields(s.id, { summary_json: JSON.stringify({ summary: "", concepts: concepts(atMin * 60_000), source: "ai" }), summary_at: Date.now() });
  await refreshSummary(s.id, true);
  console.log(`Live: "${s.title}" in ${cls.name}, lecture code ${s.code}. Students join with class code ${cls.code}.`);
  console.log(`Student: /app/live/${s.code}   Professor: /teach/live/${s.code}   (Ctrl+C to end the lecture)`);

  const taps = L.hotspots.flatMap((h) =>
    actors
      .sort(() => Math.random() - 0.5)
      .slice(0, h.students)
      .map((a) => ({ a, t: mmss(h.at) + Math.random() * (h.spread ?? 50) * 1000 })),
  );
  let sent = past.length;
  let done = false;
  const stop = async () => {
    if (done) return;
    done = true;
    await db.endSession(s.id);
    process.stdout.write("Ended. Processing… ");
    await processLecture(s.id);
    console.log(`done: /teach/${cls.code}/lecture/${s.code}`);
    process.exit(0);
  };
  process.on("SIGINT", stop);

  for (;;) {
    const now = Date.now() - started;
    while (sent < lines.length && lines[sent].start_ms <= now) {
      await db.addTranscript(s.id, [lines[sent]]);
      console.log(`[${L.lines[sent][0]}] ${lines[sent].text.slice(0, 80)}`);
      sent++;
      const cur = JSON.parse((await db.getSessionById(s.id))!.summary_json || "{}");
      if (cur.source !== "ai" || !cur.summary) await db.setSessionFields(s.id, { summary_json: JSON.stringify({ summary: "", concepts: concepts(now), source: "ai" }) });
      void refreshSummary(s.id);
    }
    for (const t of taps.filter((x) => x.t <= now && x.t > now - 1000)) await db.recordLost(s.id, t.a, now);
    if (sent >= lines.length && now > lines[lines.length - 1].end_ms + 60_000) return stop();
    await new Promise((r) => setTimeout(r, 1000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
