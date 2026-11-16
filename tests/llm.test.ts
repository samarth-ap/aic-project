import { afterEach, describe, expect, it } from "vitest";
import { aiProvider } from "../lib/analysis/llm";
import { trimForGroq } from "../lib/analysis/tutor";

const KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE", "GROQ_API_KEY", "AI_PROVIDER", "USE_LLM"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
function env(vars: Record<string, string>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, vars);
}
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("aiProvider", () => {
  it("is offline with no keys", () => {
    env({});
    expect(aiProvider()).toBeNull();
  });
  it("uses Groq when only a Groq key is set", () => {
    env({ GROQ_API_KEY: "gsk" });
    expect(aiProvider()).toBe("groq");
  });
  it("prefers Claude when both are set, unless AI_PROVIDER=groq", () => {
    env({ GROQ_API_KEY: "gsk", ANTHROPIC_API_KEY: "sk" });
    expect(aiProvider()).toBe("anthropic");
    env({ GROQ_API_KEY: "gsk", ANTHROPIC_API_KEY: "sk", AI_PROVIDER: "groq" });
    expect(aiProvider()).toBe("groq");
  });
  it("is offline when the forced provider has no key", () => {
    env({ ANTHROPIC_API_KEY: "sk", AI_PROVIDER: "groq" });
    expect(aiProvider()).toBeNull();
  });
});

describe("trimForGroq", () => {
  const min = 60_000;
  // One segment per minute for a 50-minute lecture.
  const segs = Array.from({ length: 50 }, (_, i) => ({ start_ms: i * min, end_ms: (i + 1) * min - 1, text: `m${i}` }));
  const input = (nowMs: number, asked: number[] = []) => ({
    session: { title: "L", course: "", ended: false },
    nowMs,
    transcript: segs,
    history: asked.map((t, id) => ({
      id, session_id: 1, device_id: "d", role: "user" as const, kind: "lost" as const, t_ms: t, content: "", created_at: 0,
    })),
  });

  it("keeps only the last ~12 minutes before now", () => {
    const { segs: kept, trimmed } = trimForGroq(segs, input(40 * min));
    expect(trimmed).toBe(true);
    expect(kept[0].text).toBe("m28");
    expect(kept.at(-1)!.text).toBe("m42");
  });
  it("also keeps the part around an earlier tap", () => {
    const { segs: kept } = trimForGroq(segs, input(45 * min, [10 * min]));
    const texts = kept.map((s) => s.text);
    expect(texts).toContain("m5");
    expect(texts).toContain("m40");
    expect(texts).not.toContain("m20");
  });
});
