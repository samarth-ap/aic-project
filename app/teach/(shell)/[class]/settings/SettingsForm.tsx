"use client";
import { useActionState, useTransition } from "react";
import { newClassCode, removeStudent, saveClassSettings } from "@/app/actions";

export default function SettingsForm({ code, initial }: { code: string; initial: Record<string, string> }) {
  const [state, action, pending] = useActionState(saveClassSettings.bind(null, code), {});
  return (
    <form action={action} className="card stack-lg" style={{ marginTop: 22, padding: 24 }}>
      <div className="grid2">
        <label className="field"><span>Course code</span><input className="input" name="short" defaultValue={initial.short} required /></label>
        <label className="field"><span>Course title</span><input className="input" name="long" defaultValue={initial.long} /></label>
      </div>
      <label className="field"><span>Term</span><input className="input" name="term" defaultValue={initial.term} /></label>
      <div className="grid2">
        <label className="field"><span>Next exam</span><input className="input" name="exam_name" defaultValue={initial.exam_name} placeholder="Midterm" /></label>
        <label className="field"><span>Exam date</span><input className="input" type="date" name="exam_date" defaultValue={initial.exam_date} /></label>
      </div>
      <p className="small muted" style={{ marginTop: 4 }}>Students&apos; study plans count down to this date. If you leave it empty, students can set their own.</p>
      <label className="field">
        <span>Graded work the tutor must not answer</span>
        <textarea className="input" name="graded_notes" defaultValue={initial.graded_notes} placeholder="e.g. Homework 5 (recursive maze solver), the take-home quiz on linked lists" />
        <p className="small muted" style={{ marginTop: 6 }}>The tutor gives hints or a similar example instead of answers for anything listed here.</p>
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && !pending && <p className="small" style={{ color: "var(--ok)", fontWeight: 700 }}>Saved.</p>}
      <button className="btn" disabled={pending} style={{ width: "fit-content" }}>{pending ? "Saving…" : "Save settings"}</button>
    </form>
  );
}

export function RegenerateCode({ code }: { code: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn ghost sm" style={{ marginTop: 14 }} disabled={pending} onClick={() => confirm("Make a new student code? The old code stops working; students already in the class stay in.") && start(() => newClassCode(code))}>
      Regenerate student code
    </button>
  );
}

export function RemoveStudent({ code, userId, name }: { code: string; userId: number; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="linkbtn danger small" disabled={pending} onClick={() => confirm(`Remove ${name} from the class?`) && start(() => removeStudent(code, userId))}>
      Remove
    </button>
  );
}
