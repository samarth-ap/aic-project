"use client";
import { useActionState } from "react";
import { newClass } from "@/app/actions";

export default function NewClassForm() {
  const [state, action, pending] = useActionState(newClass, {});
  return (
    <form action={action} className="card stack-lg" style={{ marginTop: 22, padding: 24 }}>
      <label className="field"><span>Course code</span><input className="input" name="short" placeholder="CSE 143" required /></label>
      <label className="field"><span>Course title</span><input className="input" name="long" placeholder="Computer Programming II" /></label>
      <label className="field"><span>Term</span><input className="input" name="term" placeholder="Autumn term" /></label>
      {state?.error && <p className="error">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? "Creating…" : "Create class"}</button>
    </form>
  );
}
