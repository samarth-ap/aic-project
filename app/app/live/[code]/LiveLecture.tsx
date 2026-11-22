"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtClock } from "@/lib/format";
import { patchEvent, TutorThread, type Msg } from "@/components/Tutor";

interface Moment {
  id: number;
  t_ms: number;
  concept: string;
  status: string;
}
interface Open {
  eventId: number | null; // null while the tap is being sent
  tapMs: number;
  initial: Msg[];
  startWith?: "lost";
  concept: string;
}
const QUEUE = "lf.queue";

function readQueue(): { code: string; t_ms: number }[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE) ?? "[]");
  } catch {
    return [];
  }
}
function writeQueue(q: { code: string; t_ms: number }[]) {
  try {
    localStorage.setItem(QUEUE, JSON.stringify(q));
  } catch {}
}

export default function LiveLecture({ code, title, sub, classCode, nowMs, dark }: { code: string; title: string; sub: string; classCode: string | null; nowMs: number; dark: boolean }) {
  // Lecture clock: server time at page load, then counted locally (re-synced on every poll).
  const origin = useRef(Date.now() - nowMs);
  const now = useCallback(() => Date.now() - origin.current, []);
  const [, tick] = useState(0);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [ended, setEnded] = useState(false);
  const [open, setOpen] = useState<Open | null>(null);
  const [list, setList] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const flushQueue = useCallback(async () => {
    const q = readQueue();
    if (!q.length) return;
    const left: typeof q = [];
    for (const item of q) {
      const res = await fetch(`/api/lectures/${item.code}/lost`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ queued_t_ms: item.t_ms }) }).catch(() => null);
      if (!res) left.push(item);
    }
    writeQueue(left);
    if (left.length < q.length) setNote("");
  }, []);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/lectures/${code}/state`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      origin.current = d.server_time - d.now_ms - 0; // server's lecture clock
      setMoments(d.my_moments);
      if (d.status !== "live") setEnded(true);
      void flushQueue();
    } catch {
      /* offline: keep counting locally */
    }
  }, [code, flushQueue]);

  useEffect(() => {
    void poll();
    const p = setInterval(poll, 8000);
    const t = setInterval(() => tick((x) => x + 1), 1000);
    window.addEventListener("online", flushQueue);
    return () => {
      clearInterval(p);
      clearInterval(t);
      window.removeEventListener("online", flushQueue);
    };
  }, [poll, flushQueue]);

  async function tapLost() {
    if (busy) return;
    setBusy(true);
    try {
      navigator.vibrate?.(12); // light haptic, no sound
    } catch {}
    const tapAt = Math.round(now());
    setOpen({ eventId: null, tapMs: tapAt, initial: [], concept: "" });
    try {
      const res = await fetch(`/api/lectures/${code}/lost`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (res.status === 409) {
        setEnded(true);
        setOpen(null);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      if (d.reopened) {
        const t = await fetch(`/api/events/${d.event_id}`).then((r) => r.json());
        setOpen({ eventId: d.event_id, tapMs: t.event.t_ms, initial: t.messages, concept: t.event.concept, startWith: t.messages.some((m: Msg) => m.role === "assistant") ? undefined : "lost" });
      } else {
        setOpen({ eventId: d.event_id, tapMs: d.t_ms, initial: [], concept: "", startWith: "lost" });
        setMoments((m) => [...m, { id: d.event_id, t_ms: d.t_ms, concept: "", status: "open" }]);
      }
    } catch {
      // Offline: keep the tap with its lecture time and send it when back online.
      writeQueue([...readQueue(), { code, t_ms: tapAt }]);
      setOpen(null);
      setNote(`No connection. Your Lost tap at ${fmtClock(tapAt)} is saved and will be sent when you're back online.`);
    } finally {
      setBusy(false);
    }
  }

  async function openMoment(m: Moment) {
    setList(false);
    const t = await fetch(`/api/events/${m.id}`).then((r) => r.json());
    setOpen({ eventId: m.id, tapMs: m.t_ms, initial: t.messages, concept: t.event.concept });
  }

  function close(gotIt = false) {
    if (open?.eventId) void patchEvent(open.eventId, gotIt ? { status: "got_it", closed: true } : { closed: true });
    if (gotIt && open?.eventId) setMoments((ms) => ms.map((m) => (m.id === open.eventId ? { ...m, status: "got_it" } : m)));
    setOpen(null);
  }

  // Swipe down on the sheet's handle area to close it.
  const touchY = useRef<number | null>(null);

  const theme = dark ? "" : "light";
  if (ended) {
    return (
      <main className={`live ${theme}`}>
        <div className="app no-tabs" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
          <p className="live-sub">{sub}</p>
          <h1>{title}</h1>
          <div className="lost-zone">
            <p className="tldr-head" style={{ textAlign: "center" }}>This lecture has ended.</p>
            <p className="anon-note">Your {moments.length} Lost moment{moments.length === 1 ? " is" : "s are"} saved. Class hotspots show up in a few minutes.</p>
            <Link className="btn gold" style={{ marginTop: 24 }} href={`/app/lecture/${code}`}>Open the lecture</Link>
          </div>
        </div>
      </main>
    );
  }
  return (
    <main className={`live ${theme}`}>
      <div className="app no-tabs" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <div className="live-top">
          <span>
            <span className="dot" style={{ marginRight: 8 }} />
            Live<span className="clock mono">{fmtClock(now())}</span>
          </span>
          <Link href={classCode ? `/app/class/${classCode}` : "/app"}>Leave</Link>
        </div>
        <p className="live-sub">{sub}</p>
        <h1>{title}</h1>
        <div className="lost-zone">
          <div className="lost-ring">
            <div>
              <button className="lost-btn" onClick={tapLost} disabled={busy} aria-label="Lost: tap for a quick explanation of what was just said">
                <strong>Lost</strong>
                <span>Tap for a quick explanation</span>
              </button>
            </div>
          </div>
          <p className="anon-note">Your professor sees how many students were lost, never who.</p>
          <p className="anon-note tiny" style={{ marginTop: 8, opacity: 0.8 }}>This lecture is being recorded and transcribed. Audio is kept until the end of term.</p>
          {note && <p className="notice dark" style={{ marginTop: 16 }} role="status">{note}</p>}
        </div>
        <button className="moments-bar" onClick={() => moments.length && setList(true)} style={{ border: 0, cursor: moments.length ? "pointer" : "default", textAlign: "left", width: "100%" }}>
          <span>
            <span className="bold" style={{ display: "block" }}>My moments this lecture</span>
            <span className="small" style={{ opacity: 0.8 }}>{moments.length ? moments.map((m) => fmtClock(m.t_ms)).join(" · ") : "None yet"}</span>
          </span>
          <span className="n mono">{moments.length}</span>
        </button>
      </div>

      {list && (
        <>
          <div className="sheet-back" onClick={() => setList(false)} />
          <div className="sheet" style={{ height: "auto", maxHeight: "70dvh" }} role="dialog" aria-label="My moments this lecture">
            <button className="grab" onClick={() => setList(false)} aria-label="Close" />
            <div className="sheet-body" style={{ paddingBottom: 24 }}>
              <h2 style={{ margin: "6px 0 12px" }}>My moments</h2>
              {moments.map((m) => (
                <button key={m.id} className="missed" style={{ marginTop: 10 }} onClick={() => openMoment(m)}>
                  <span><b>{fmtClock(m.t_ms)}</b> {m.concept || "Open the chat"}</span>
                  <span>{m.status === "got_it" ? "Got it" : m.status === "fuzzy" ? "Still fuzzy" : ""}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {open && (
        <>
          <div className="sheet-back" onClick={() => close()} />
          <div className="sheet" role="dialog" aria-label="Tutor">
            <div
              onTouchStart={(e) => (touchY.current = e.touches[0].clientY)}
              onTouchEnd={(e) => {
                if (touchY.current != null && e.changedTouches[0].clientY - touchY.current > 60) close();
                touchY.current = null;
              }}
            >
              <button className="grab" onClick={() => close()} aria-label="Close the tutor" />
              <div className="between small" style={{ padding: "6px 20px 0" }}>
                <span style={{ color: "#cfcaf5", fontWeight: 600 }}>Lost at {fmtClock(open.tapMs)}</span>
                {open.concept && <span className="bold" style={{ color: "var(--gold)" }}>You&apos;re in: {open.concept.toLowerCase()}</span>}
              </div>
            </div>
            {open.eventId ? (
              <TutorThread
                key={open.eventId}
                code={code}
                eventId={open.eventId}
                tapMs={open.tapMs}
                initial={open.initial}
                startWith={open.startWith}
                live
                nowMs={now}
                onConcept={(c) => setOpen((o) => (o && !o.concept ? { ...o, concept: c } : o))}
                onGotIt={() => close(true)}
              />
            ) : (
              <div className="sheet-body">
                <p className="tldr-head typing">Catching up on what was just said</p>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
