import { afterEach, describe, expect, it } from "vitest";
import { tapPrompt, tutorReply, type TutorInput } from "../lib/analysis/tutor";
import type { ChatMessage } from "../lib/db";

const msg = (kind: ChatMessage["kind"], content: string): ChatMessage => ({
  id: 1, session_id: 1, device_id: "dev-12345678", role: "user", kind, t_ms: 0, content, created_at: 0,
});
const collect = async (it: AsyncGenerator<string>) => {
  let s = "";
  for await (const c of it) s += c;
  return s;
};
const base = (over: Partial<TutorInput>): TutorInput => ({
  session: { title: "L7", course: "MATH 208", ended: false },
  nowMs: 300_000,
  transcript: [],
  history: [],
  ...over,
});

describe("tutor (offline)", () => {
  const prev = process.env.USE_LLM;
  process.env.USE_LLM = "0";
  afterEach(() => void (process.env.USE_LLM = prev ?? "0"));

  it("turns taps into a prompt with the lecture time", () => {
    expect(tapPrompt("lost", 125_000)).toContain("2:05");
    expect(tapPrompt("example", 0)).toContain("example");
  });

  it("quotes the last few minutes of transcript after a tap", async () => {
    const out = await collect(
      tutorReply(
        base({
          transcript: [
            { start_ms: 10_000, end_ms: 12_000, text: "way earlier" },
            { start_ms: 250_000, end_ms: 255_000, text: "an eigenvector only gets stretched" },
          ],
          history: [msg("lost", tapPrompt("lost", 300_000))],
        }),
      ),
    );
    expect(out).toContain("eigenvector only gets stretched");
    expect(out).not.toContain("way earlier");
  });

  it("says when there is no transcript", async () => {
    const out = await collect(tutorReply(base({ history: [msg("lost", "x")] })));
    expect(out).toMatch(/live captions/);
  });
});
