"use client";
// One Lost moment's tutor thread: the TLDR, quick replies, follow-ups and
// "What did I miss?". Used in the live sheet (dark) and after class (light).
import { useCallback, useEffect, useRef, useState } from "react";
import { splitConcept, tldrParts } from "@/lib/tutor-text";
import { fmtClock } from "@/lib/format";
import { IconChevron, IconUp } from "./icons";

export type Kind = "lost" | "text" | "more" | "example" | "missed" | "again";
export interface Msg {
  role: "user" | "assistant";
  kind: Kind;
  content: string;
}

/** Streams a tutor reply. Calls onText with the text so far. */
export async function streamTutor(code: string, body: { event_id: number; kind: Kind; text?: string }, onText: (t: string) => void): Promise<string> {
  const res = await fetch(`/api/lectures/${code}/tutor`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? "The tutor isn't available right now.");
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    full += value;
    onText(full);
  }
  return full;
}

export async function patchEvent(id: number, body: { status?: "got_it" | "fuzzy" | "open"; closed?: boolean }) {
  await fetch(`/api/events/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
}

function Answer({ text, first, streaming }: { text: string; first: boolean; streaming: boolean }) {
  const { body } = splitConcept(text);
  if (!body.trim()) return <div className="bubble-ai"><span className="typing">{streaming ? "" : "…"}</span></div>;
  if (first) {
    const p = tldrParts(body);
    return (
      <div>
        {p.headline && <p className="tldr-head">{p.headline}</p>}
        {p.rest && <div className={`tldr-body ${streaming && !p.example ? "typing" : ""}`}>{p.rest}</div>}
        {p.example && <div className={`example ${streaming ? "typing" : ""}`}>{p.example}</div>}
      </div>
    );
  }
  return <div className={`bubble-ai ${streaming ? "typing" : ""}`}>{body}</div>;
}

const LABEL: Partial<Record<Kind, string>> = { more: "Explain more", example: "Give an example", again: "Explain again", missed: "What did I miss?" };

export function TutorThread({
  code,
  eventId,
  tapMs,
  initial,
  startWith,
  live,
  nowMs,
  onConcept,
  onGotIt,
  footer = true,
}: {
  code: string;
  eventId: number;
  tapMs: number;
  initial: Msg[];
  /** Send this first (e.g. "lost" right after the tap, "again" from the study plan). */
  startWith?: Kind;
  live: boolean;
  nowMs?: () => number;
  onConcept?: (c: string) => void;
  onGotIt?: () => void;
  footer?: boolean;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [streaming, setStreaming] = useState(false);
  const [err, setErr] = useState("");
  const [text, setText] = useState("");
  const [, tick] = useState(0);
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  const send = useCallback(
    async (kind: Kind, typed?: string) => {
      if (streaming) return;
      setErr("");
      setStreaming(true);
      const user: Msg = { role: "user", kind, content: kind === "text" ? typed! : LABEL[kind] ?? "" };
      setMsgs((m) => [...m, user, { role: "assistant", kind: "text", content: "" }]);
      try {
        await streamTutor(code, { event_id: eventId, kind, text: typed }, (t) => {
          const { concept } = splitConcept(t);
          if (concept) onConcept?.(concept);
          setMsgs((m) => [...m.slice(0, -1), { role: "assistant", kind: "text", content: t }]);
        });
      } catch (e) {
        setErr((e as Error).message);
        setMsgs((m) => m.slice(0, -1));
      } finally {
        setStreaming(false);
      }
    },
    [code, eventId, onConcept, streaming],
  );

  useEffect(() => {
    if (started.current || !startWith) return;
    started.current = true;
    if (startWith === "lost" && initial.some((m) => m.role === "assistant")) return;
    void send(startWith);
  }, [startWith, initial, send]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [live]);

  useEffect(() => {
    if (msgs.length > 2) bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [msgs.length]);

  const firstAnswer = msgs.findIndex((m) => m.role === "assistant");
  const since = live && nowMs ? Math.max(0, Math.round((nowMs() - tapMs) / 1000)) : 0;

  return (
    <>
      <div className="sheet-body">
        {msgs.map((m, i) =>
          m.role === "user" ? (
            m.kind === "lost" ? null : (
              <div key={i} className="bubble-user">{m.kind === "text" ? m.content : LABEL[m.kind] ?? m.content}</div>
            )
          ) : (
            <Answer key={i} text={m.content} first={i === firstAnswer} streaming={streaming && i === msgs.length - 1} />
          ),
        )}
        {!msgs.length && !streaming && <p className="tldr-body" style={{ opacity: 0.8 }}>Your Lost moment at {fmtClock(tapMs)} is saved. Ask the tutor about it below.</p>}
        {err && <p className="error" style={{ marginTop: 12, color: live ? "#ffb4a6" : undefined }}>{err}</p>}
        {firstAnswer >= 0 && (
          <div className="qreply">
            {onGotIt && (
              <button className="primary" disabled={streaming} onClick={onGotIt}>Got it</button>
            )}
            <button disabled={streaming} onClick={() => send("more")}>Explain more</button>
            <button disabled={streaming} onClick={() => send("example")}>Give an example</button>
          </div>
        )}
        <div ref={bottom} />
      </div>
      {footer && (
        <div className="sheet-foot">
          {live && firstAnswer >= 0 && (
            <button className="missed" disabled={streaming} onClick={() => send("missed")}>
              <span>
                <b>What did I miss?</b> {since} second{since === 1 ? "" : "s"} since you tapped
              </span>
              <IconChevron />
            </button>
          )}
          <form
            className="ask"
            onSubmit={(e) => {
              e.preventDefault();
              const t = text.trim();
              if (!t) return;
              setText("");
              void send("text", t);
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a follow-up" maxLength={1000} aria-label="Ask the tutor a follow-up" />
            <button disabled={streaming || !text.trim()} aria-label="Send">
              <IconUp />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
