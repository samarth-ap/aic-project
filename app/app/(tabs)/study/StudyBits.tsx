"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setMyExamDate } from "@/app/actions";

export function ClassPicker({ classes, current }: { classes: { code: string; short: string }[]; current: string }) {
  const router = useRouter();
  if (classes.length < 2) return <span className="chip" style={{ cursor: "default" }}>{classes[0]?.short}</span>;
  return (
    <select className="chip" value={current} onChange={(e) => router.push(`/app/study?class=${e.target.value}`)} aria-label="Class">
      {classes.map((c) => (
        <option key={c.code} value={c.code}>{c.short}</option>
      ))}
    </select>
  );
}

export function ExamDate({ classCode, current }: { classCode: string; current: number | null }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const iso = current ? new Date(current).toISOString().slice(0, 10) : "";
  if (!editing)
    return (
      <button className="linkbtn small" style={{ color: "var(--gold)", marginTop: 8 }} onClick={() => setEditing(true)}>
        {current ? "Change exam date" : "Set your exam date"}
      </button>
    );
  return (
    <form
      className="row"
      style={{ marginTop: 10 }}
      action={(f) => start(async () => { await setMyExamDate(classCode, String(f.get("date") ?? "")); setEditing(false); })}
    >
      <input type="date" name="date" defaultValue={iso} className="input" style={{ minHeight: 42, width: "auto", padding: "6px 12px" }} />
      <button className="btn gold sm" disabled={pending}>Save</button>
    </form>
  );
}
