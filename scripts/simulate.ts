// Rehearsal helper: fakes a class of students tapping on a LIVE lecture, so you
// can practice the demo without 30 phones.
//   npm run simulate -- <CODE> [students=30] [baseUrl=http://localhost:3000]
// Press Enter to trigger a confusion spike; Ctrl+C (or Ctrl+D) to stop.
import readline from "node:readline";

const [code, n = "30", base = "http://localhost:3000"] = process.argv.slice(2);
if (!code) {
  console.error("usage: npm run simulate -- <CODE> [students] [baseUrl]");
  process.exit(1);
}
const devices = Array.from({ length: Number(n) }, () => crypto.randomUUID());
const post = (path: string, body: unknown) =>
  fetch(`${base}/api/sessions/${code}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);

async function main() {
  await Promise.all(devices.map((deviceId) => post("", { deviceId })));
  console.log(`${devices.length} simulated students joined ${code}. Press Enter for a confusion spike.`);
  setInterval(() => devices.forEach((deviceId) => post("", { deviceId })), 45_000);
  // Background: an occasional stray tap.
  setInterval(() => {
    if (Math.random() < 0.3) post("/tap", { deviceId: devices[Math.floor(Math.random() * devices.length)], kind: "lost" });
  }, 5_000);
  readline.createInterface({ input: process.stdin }).on("line", () => {
    const k = Math.round(devices.length * (0.25 + Math.random() * 0.2));
    const who = [...devices].sort(() => Math.random() - 0.5).slice(0, k);
    who.forEach((deviceId, i) =>
      setTimeout(() => post("/tap", { deviceId, kind: i % 4 === 3 ? "too_fast" : "lost" }), Math.random() * 15_000),
    );
    console.log(`Spike: ${k} students will tap over the next 15s.`);
  }).on("close", () => setTimeout(() => process.exit(0), 16_000)); // Ctrl+D: finish the last spike, then exit
}
main();
