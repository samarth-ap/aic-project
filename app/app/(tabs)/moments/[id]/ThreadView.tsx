"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { patchEvent, TutorThread, type Msg } from "@/components/Tutor";

export default function ThreadView({ code, eventId, tapMs, status, live, again, initial }: { code: string; eventId: number; tapMs: number; status: string; live: boolean; again: boolean; initial: Msg[] }) {
  const [st, setSt] = useState(status);
  const router = useRouter();
  const mark = (s: "got_it" | "fuzzy") => {
    setSt(s);
    void patchEvent(eventId, { status: s });
  };
  return (
    <div className="chat-light" style={{ marginTop: 10 }}>
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="small muted">How is it now?</span>
        <button className={`chip ${st === "got_it" ? "on" : ""}`} onClick={() => mark("got_it")}>Got it</button>
        <button className={`chip ${st === "fuzzy" ? "on" : ""}`} onClick={() => mark("fuzzy")}>Still fuzzy</button>
      </div>
      <TutorThread code={code} eventId={eventId} tapMs={tapMs} initial={initial} startWith={again ? "again" : undefined} live={false} />
      <div className="between small" style={{ marginTop: 18 }}>
        <Link href={`/app/lecture/${code}?t=${Math.max(0, tapMs - 60_000)}`}>{live ? "" : "Replay this moment"}</Link>
        <button
          className="linkbtn danger small"
          onClick={async () => {
            if (!confirm("Delete this chat? This can't be undone.")) return;
            await fetch(`/api/events/${eventId}`, { method: "DELETE" });
            router.push("/app/moments");
            router.refresh();
          }}
        >
          Delete this chat
        </button>
      </div>
    </div>
  );
}
