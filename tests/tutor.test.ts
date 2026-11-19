import { afterEach, describe, expect, it } from "vitest";
import { conceptAt, offlineReply, quickPrompt, tutorReply, type TutorInput } from "../lib/analysis/tutor";
import { splitConcept, tldrParts } from "../lib/tutor-text";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

const transcript = [
  { start_ms: 0, end_ms: 20_000, text: "Today we look at recursion." },
  { start_ms: 60_000, end_ms: 80_000, text: "The function calls itself with n minus one until it hits the base case." },
  { start_ms: 100_000, end_ms: 120_000, text: "For factorial the base case is zero." },
];
const input = (over: Partial<TutorInput> = {}): TutorInput => ({
  lecture: { title: "Recursion", course: "CSE 143", ended: false, slides: "", gradedNotes: "" },
  summary: { summary: "", concepts: [{ name: "recursion", start_ms: 0 }, { name: "base cases", start_ms: 55_000 }] },
  transcript,
  nowMs: 125_000,
  tapMs: 90_000,
  earlierThreads: [],
  history: [{ role: "user", kind: "lost", content: "[Tapped Lost at 1:30]", t_ms: 90_000 }],
  ...over,
});

describe("splitConcept", () => {
  it("pulls the [[concept]] tag off a reply", () => {
    expect(splitConcept("[[base cases]]\nA base case is where it stops.")).toEqual({ concept: "base cases", body: "A base case is where it stops." });
  });
  it("hides a tag that is still streaming", () => {
    expect(splitConcept("[[base ca")).toEqual({ concept: "", body: "" });
  });
  it("leaves replies without a tag alone", () => {
    expect(splitConcept("Sure, here's an example.").body).toBe("Sure, here's an example.");
  });
});

describe("tldrParts", () => {
  it("splits headline, body and example", () => {
    const p = tldrParts("A base case is where the recursion stops. Each call makes the problem smaller.\nExample: In factorial(n), the base case is n = 0.");
    expect(p.headline).toBe("A base case is where the recursion stops.");
    expect(p.rest).toBe("Each call makes the problem smaller.");
    expect(p.example).toBe("In factorial(n), the base case is n = 0.");
  });
});

describe("tutor context", () => {
  it("knows which concept the professor was on at a time", () => {
    expect(conceptAt(input().summary, 90_000)).toBe("base cases");
    expect(conceptAt(input().summary, 10_000)).toBe("recursion");
    expect(conceptAt(null, 10_000)).toBe("");
  });
  it("describes 'What did I miss?' as seconds since the tap", () => {
    expect(quickPrompt("missed", 90_000, 128_000)).toContain("38 seconds");
  });
});

describe("offline tutor (no AI key)", () => {
  it("quotes what was just said, tagged with the concept", async () => {
    process.env = { ...saved, USE_LLM: "0" } as NodeJS.ProcessEnv;
    let out = "";
    for await (const c of tutorReply(input())) out += c;
    expect(splitConcept(out).concept).toBe("base cases");
    expect(out).toContain("base case");
  });
  it("answers 'What did I miss?' from the transcript since the tap", () => {
    const r = offlineReply(input({ history: [{ role: "user", kind: "missed", content: "", t_ms: 125_000 }] }));
    expect(r).toContain("factorial");
    expect(r).not.toContain("calls itself");
  });
});
