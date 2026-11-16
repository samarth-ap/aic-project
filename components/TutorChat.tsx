"use client";
// Private AI tutor chat. Opened by an "I'm lost" / "Example please" tap (which
// sends an automatic prompt) or by the "Ask the AI" button.
import { useCallback, useEffect, useRef, useState } from "react";
import { deviceId, fmt } from "@/lib/client";

export type TutorTrigger = { kind: "lost" | "example"; nonce: number } | null;

interface Msg {
  role: "user" | "assistant";
  kind: "text" | "lost" | "example";
  t_ms: number;
  content: string;
}

export default function TutorChat({
  code,
  live,
  trigger,
  onClose,
}: {
  code: string;
  live: boolean;
  trigger?: TutorTrigger;
  onClose?: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const lastNonce = useRef<number | null>(null);

  useEffect(() => {
    fetch(`/api/sessions/${code}/chat?deviceId=${deviceId()}`)
      .then((r) => r.json())
      .then((d) => d.messages && setMsgs((cur) => (cur.length ? cur : d.messages)))
      .catch(() => {});
  }, [code]);

  // Braces matter: newer browsers return a Promise from scrollIntoView, which React rejects as a cleanup.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [msgs]);

  const send = useCallback(
    async (payload: { text: string } | { tap: "lost" | "example" }) => {
      setBusy(true);
      setErr("");
      const userMsg: Msg =
        "text" in payload
          ? { role: "user", kind: "text", t_ms: 0, content: payload.text }
          : { role: "user", kind: payload.tap, t_ms: 0, content: "" };
      setMsgs((m) => [...m, userMsg, { role: "assistant", kind: "text", t_ms: 0, content: "" }]);
      try {
        const res = await fetch(`/api/sessions/${code}/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId: deviceId(), ...payload }),
        });
        if (!res.ok || !res.body) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          setMsgs((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, content: last.content + chunk };
            return copy;
          });
        }
      } catch (e) {
        setErr((e as Error).message);
        setMsgs((m) => (m[m.length - 1]?.content ? m : m.slice(0, -2)));
      } finally {
        setBusy(false);
      }
    },
    [code],
  );

  // A new tap opens the chat with an automatic "what just happened?" prompt.
  useEffect(() => {
    if (!trigger || trigger.nonce === lastNonce.current) return;
    lastNonce.current = trigger.nonce;
    send({ tap: trigger.kind });
  }, [trigger, send]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    send({ text });
  }

  return (
    <section className="card chat" aria-label="AI tutor">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>AI tutor</strong>
        {onClose && (
          <button className="link-btn" onClick={onClose} aria-label="Close chat">
            Close
          </button>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 4 }}>
        Knows what your professor has said so far. Private: your professor only sees anonymous summaries of common
        questions.
      </p>

      <div className="chat-log">
        {msgs.length === 0 && (
          <p className="small muted">
            {live ? "Ask anything about this lecture, or tap I'm lost." : "Ask anything about this lecture."}
          </p>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            m.kind === "text" ? (
              <div key={i} className="bubble me">{m.content}</div>
            ) : (
              <div key={i} className="chat-chip">
                {m.kind === "lost" ? "You tapped I'm lost" : "You asked for an example"}
                {m.t_ms ? ` at ${fmt(m.t_ms)}` : ""}
              </div>
            )
          ) : (
            <div key={i} className="bubble ai">
              {m.content || <span className="typing" aria-label="Thinking">●●●</span>}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {err && <div className="banner">{err}</div>}
      <form className="chat-form" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={live ? "Ask a follow-up…" : "Ask about this lecture…"}
          maxLength={1000}
          aria-label="Message the AI tutor"
        />
        <button className="btn" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
