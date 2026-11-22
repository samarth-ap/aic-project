"use client";
import { useActionState } from "react";
import { newClass } from "@/app/actions";
import TermPicker from "@/components/TermPicker";

export default function NewClassForm() {
  const [state, action, pending] = useActionState(newClass, {});
  return (
    <form action={action} className="card stack-lg" style={{ marginTop: 22, padding: 24 }}>
      <label className="field"><span>Course code</span><input className="input" name="short" placeholder="CSE 143" required /></label>
      <label className="field"><span>Course title</span><input className="input" name="long" placeholder="Computer Programming II" /></label>
      <TermPicker isNew />
      <label className="field">
        <span>Delete lecture audio on</span>
        <input className="input" type="date" name="audio_delete_on" />
        <p className="small muted" style={{ marginTop: 6 }}>Recordings are kept for replay until this date (usually the end of term), then deleted. Transcripts stay.</p>
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? "Creating…" : "Create class"}</button>
    </form>
  );
}
