// Seeds a demo course with lectures, synthetic taps and questions, then runs
// the analysis on each.   npm run seed
import { addQuestion, addTap, addTranscript, createSession, endSession, touchPresence } from "../lib/db";
import { analyzeSession } from "../lib/pipeline";
import { getSessionById } from "../lib/db";
import { hasClaudeCredentials } from "../lib/analysis/report";
import { COURSE, LECTURES } from "./data/lectures";

// Deterministic pseudo-random so demo data is stable between runs.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);

async function main() {
  console.log(`AI analysis: ${hasClaudeCredentials() ? "ON" : "OFF (set ANTHROPIC_API_KEY for full reports)"}`);
  for (const L of LECTURES) {
    const lastLine = L.lines[L.lines.length - 1][0];
    const durationMs = (lastLine + 30) * 1000;
    const startedAt = Date.now() - L.daysAgo * 86_400_000 - durationMs;
    const s = createSession(L.title, COURSE, startedAt);
    const devices = Array.from({ length: L.students }, (_, i) => `demo-${s.code}-${String(i).padStart(3, "0")}`);
    devices.forEach((d) => touchPresence(s.id, d, Math.floor(rand() * 60_000)));

    addTranscript(
      s.id,
      L.lines.map(([sec, text], i) => ({
        start_ms: sec * 1000,
        end_ms: (L.lines[i + 1]?.[0] ?? sec + 25) * 1000,
        text,
      })),
    );

    // Background noise: a few scattered taps.
    for (let i = 0; i < Math.round(L.students * 0.15); i++) {
      addTap(s.id, devices[Math.floor(rand() * devices.length)], rand() < 0.7 ? "lost" : "too_fast", Math.floor(rand() * durationMs));
    }
    // "Got it" taps sprinkled around.
    for (let i = 0; i < Math.round(L.students * 0.2); i++) {
      addTap(s.id, devices[Math.floor(rand() * devices.length)], "got_it", Math.floor(rand() * durationMs));
    }
    // Spikes: distinct students tapping around `at`.
    for (const sp of L.spikes) {
      const pool = [...devices].sort(() => rand() - 0.5).slice(0, sp.students);
      const kinds = sp.kinds ?? ["lost"];
      pool.forEach((d, i) =>
        addTap(s.id, d, kinds[i % kinds.length], Math.round((sp.at + (rand() - 0.3) * sp.spread) * 1000)),
      );
    }
    L.questions.forEach(([sec, text], i) => addQuestion(s.id, devices[i * 3], sec * 1000, text));
    endSession(s.id, startedAt + durationMs);

    process.stdout.write(`Analyzing "${L.title}"… `);
    const r = await analyzeSession(getSessionById(s.id)!);
    console.log(`${r.moments.length} moments (${r.mode})${r.warning ? ` — ${r.warning}` : ""}`);
    console.log(`  report:  /prof/${s.code}/report#k=${s.admin_key}`);
    console.log(`  student: /s/${s.code}/catchup`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
