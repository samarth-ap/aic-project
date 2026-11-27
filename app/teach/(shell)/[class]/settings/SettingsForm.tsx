"use client";
import { useActionState, useTransition } from "react";
import { newClassCode, removeStudent, saveClassSettings } from "@/app/actions";
import TermPicker from "@/components/TermPicker";

export default function SettingsForm({ code, initial, canSetGuestSignIn }: { code: string; initial: Record<string, string>; canSetGuestSignIn: boolean }) {
  const [state, action, pending] = useActionState(saveClassSettings.bind(null, code), {});
  const [, startSave] = useTransition();
  return (
    // Submit by hand so React doesn't reset the form (and the dropdowns) after saving.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startSave(() => action(data));
      }}
      className="card stack-lg" style={{ marginTop: 22, padding: 24 }}>
      <div className="grid2">
        <label className="field"><span>Course code</span><input className="input" name="short" defaultValue={initial.short} required /></label>
        <label className="field"><span>Course title</span><input className="input" name="long" defaultValue={initial.long} /></label>
      </div>
      <TermPicker key={initial.term} term={initial.term} />
      {canSetGuestSignIn && (
        <label className="field">
          <span>Guest email sign-in</span>
          <select className="input" name="allow_guests" defaultValue={initial.allow_guests}>
            <option value="0">Use site email rules</option>
            <option value="1">Allow guest emails</option>
          </select>
          <p className="small muted" style={{ marginTop: 6 }}>Guests verify their email and use this class&apos;s QR code or invite link to join as students.</p>
        </label>
      )}
      <div className="grid2">
        <label className="field"><span>Next exam</span><input className="input" name="exam_name" defaultValue={initial.exam_name} placeholder="Midterm" /></label>
        <label className="field"><span>Exam date</span><input className="input" type="date" name="exam_date" defaultValue={initial.exam_date} /></label>
      </div>
      <p className="small muted" style={{ marginTop: 4 }}>Students&apos; study plans count down to this date. If you leave it empty, students can set their own.</p>
      <label className="field">
        <span>End-of-term audio deletion</span>
        <input className="input" type="date" name="audio_delete_on" defaultValue={initial.audio_delete_on} />
        <p className="small muted" style={{ marginTop: 6 }}>Lecture audio is deleted on this date. Transcripts, markers and chats stay.</p>
      </label>
      <label className="field">
        <span>Graded work the tutor must not answer</span>
        <textarea className="input" name="graded_notes" defaultValue={initial.graded_notes} placeholder="e.g. Homework 5 (recursive maze solver), the take-home quiz on linked lists" />
        <p className="small muted" style={{ marginTop: 6 }}>The tutor gives hints or a similar example instead of answers for anything listed here.</p>
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && !pending && <p className="small" style={{ color: "var(--ok)", fontWeight: 700 }}>Saved.</p>}
      <button className="btn" disabled={pending} style={{ width: "fit-content" }}>{pending ? "Saving…" : "Save changes"}</button>
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
