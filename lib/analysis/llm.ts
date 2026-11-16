// Which AI provider the app uses, plus a small Groq client.
//
//   ANTHROPIC_API_KEY set  -> Claude (default)
//   GROQ_API_KEY set       -> Groq (OpenAI-compatible API, open models)
//   both set               -> Claude, unless AI_PROVIDER=groq
//   neither                -> offline mode (no AI, everything else works)
//
// Groq is called with plain fetch, so there's no extra dependency.
import { z } from "zod";

export type Provider = "anthropic" | "groq";

const hasAnthropicKey = () =>
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
const hasGroqKey = () => Boolean(process.env.GROQ_API_KEY);

export function aiProvider(): Provider | null {
  if (process.env.USE_LLM === "0") return null;
  const forced = process.env.AI_PROVIDER?.toLowerCase();
  if (forced === "groq") return hasGroqKey() ? "groq" : null;
  if (forced === "anthropic" || forced === "claude") return hasAnthropicKey() ? "anthropic" : null;
  if (hasAnthropicKey()) return "anthropic";
  if (hasGroqKey()) return "groq";
  return null;
}

/** After-class report and quarter topics. */
export const GROQ_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
/** Live tutor: the smaller model is about twice as fast. */
export const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL ?? "openai/gpt-oss-20b";
const BASE_URL = (process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");

type Effort = "low" | "medium" | "high";
type Msg = { role: "system" | "user" | "assistant"; content: string };

export class GroqError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// gpt-oss models take a reasoning effort and support strict JSON schemas; others don't.
const isGptOss = (model: string) => model.startsWith("openai/gpt-oss");

async function post(body: Record<string, unknown>): Promise<Response> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text.slice(0, 300);
    try {
      msg = JSON.parse(text)?.error?.message ?? msg;
    } catch {}
    throw new GroqError(`Groq ${res.status}: ${msg}`, res.status);
  }
  return res;
}

/** Streams a chat reply as text chunks. */
export async function* groqStream(opts: {
  system: string;
  messages: Msg[];
  maxTokens: number;
  effort?: Effort;
}): AsyncGenerator<string> {
  const model = GROQ_CHAT_MODEL;
  const res = await post({
    model,
    stream: true,
    max_completion_tokens: opts.maxTokens,
    ...(isGptOss(model) ? { reasoning_effort: opts.effort ?? "low" } : {}),
    messages: [{ role: "system", content: opts.system }, ...opts.messages],
  });
  if (!res.body) return;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let finish: string | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.trim().replace(/^data:\s*/, "");
      if (!data || data === "[DONE]" || !line.trim().startsWith("data:")) continue;
      try {
        const choice = JSON.parse(data)?.choices?.[0];
        // gpt-oss also streams its reasoning in a separate field; only the answer is shown.
        if (choice?.delta?.content) yield choice.delta.content as string;
        if (choice?.finish_reason) finish = choice.finish_reason;
      } catch {
        /* ignore keep-alives / partial lines */
      }
    }
  }
  if (finish === "length") yield "…";
}

/** One request that must return JSON matching `schema`. Retries once if the JSON doesn't validate. */
export async function groqJson<S extends z.ZodType>(opts: {
  schema: S;
  name: string;
  system?: string;
  user: string;
  maxTokens: number;
  effort?: Effort;
}): Promise<z.infer<S>> {
  const model = GROQ_MODEL;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema: _drop, ...jsonSchema } = z.toJSONSchema(opts.schema) as Record<string, unknown>;
  const messages: Msg[] = [
    ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
    { role: "user", content: opts.user },
  ];
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await post({
      model,
      max_completion_tokens: opts.maxTokens,
      ...(isGptOss(model) ? { reasoning_effort: opts.effort ?? "medium" } : {}),
      response_format: {
        type: "json_schema",
        json_schema: { name: opts.name, strict: isGptOss(model), schema: jsonSchema },
      },
      messages,
    });
    const body = await res.json();
    const choice = body?.choices?.[0];
    if (choice?.finish_reason === "length") throw new Error("Response was cut off (max tokens).");
    try {
      return opts.schema.parse(JSON.parse(choice?.message?.content ?? ""));
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Could not parse the AI's response: ${(lastErr as Error)?.message?.slice(0, 200)}`);
}
