import { notFound } from "next/navigation";
import { canSetClassGuestSignIn } from "@/lib/access";
import { getClassByCode, getRole, roster } from "@/lib/db";
import { isStaffRole } from "@/lib/auth";
import { requireUser } from "@/lib/server";
import { longName, shortName } from "@/lib/views";
import { spacedCode } from "@/lib/format";
import SettingsForm, { RegenerateCode, RemoveStudent } from "./SettingsForm";

export const dynamic = "force-dynamic";

const iso = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");

export default async function Settings({ params }: { params: Promise<{ class: string }> }) {
  const code = (await params).class;
  const u = await requireUser(`/teach/${code}/settings`);
  const c = await getClassByCode(code);
  const role = c ? await getRole(c.id, u.id) : null;
  if (!c || !isStaffRole(role)) notFound();
  const people = await roster(c.id);
  const students = people.filter((p) => p.role === "student");
  const staff = people.filter((p) => p.role !== "student");
  return (
    <div style={{ maxWidth: 720 }}>
      <p className="crumb">{shortName(c)}</p>
      <h1>Edit class</h1>
      <p className="muted" style={{ marginTop: 6 }}>Change the name, quarter, exam date and tutor rules. Students see the new details right away; the class code stays the same.</p>
      <SettingsForm
        code={c.code}
        initial={{ short: shortName(c), long: longName(c), term: c.term, exam_name: c.exam_name, exam_date: iso(c.exam_date), audio_delete_on: iso(c.audio_delete_on), graded_notes: c.graded_notes, allow_guests: c.allow_guests ? "1" : "0" }}
        canSetGuestSignIn={canSetClassGuestSignIn(role)}
      />
      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <h3>Join codes</h3>
        <p style={{ marginTop: 10 }}>Students: <b className="mono">{spacedCode(c.code)}</b></p>
        {role === "instructor" && (
          <>
            <p style={{ marginTop: 6 }}>TAs (professor&apos;s view, can&apos;t delete the class): <b className="mono">{c.staff_code}</b></p>
            <RegenerateCode code={c.code} />
          </>
        )}
      </div>
      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <h3>People</h3>
        <p className="small muted" style={{ marginTop: 4 }}>Names are shown here only, so you can manage the class. They are never connected to Lost taps or chats.</p>
        <div className="stack" style={{ marginTop: 14 }}>
          {staff.map((p) => (
            <div key={p.user_id} className="between small"><span>{p.name} <span className="muted">{p.email}</span></span><span className="muted">{p.role === "instructor" ? "Instructor" : "TA"}</span></div>
          ))}
          {students.map((p) => (
            <div key={p.user_id} className="between small"><span>{p.name} <span className="muted">{p.email}</span></span><RemoveStudent code={c.code} userId={p.user_id} name={p.name} /></div>
          ))}
          {!students.length && <p className="small muted">No students yet.</p>}
        </div>
      </div>
    </div>
  );
}
