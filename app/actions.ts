"use server";
// Server actions: every mutation a page makes outside the live/tutor APIs.
// Each one checks who is signed in and what they may do.
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser, isStaffRole, signOut } from "@/lib/auth";
import {
  addManualClarification,
  addMembership,
  createClass,
  createSession,
  deleteSession,
  deleteUserData,
  endSession,
  getClassByCode,
  getClassById,
  liveSessionsForClasses,
  getClassByStaffCode,
  getHotspot,
  getRole,
  getSession,
  getSessionById,
  recordHotspotView,
  regenerateClassCode,
  removeMembership,
  setPrefs,
  setSessionFields,
  setUserKind,
  updateClass,
  updateHotspot,
  userActorId,
  getPrefs,
  type Prefs,
} from "@/lib/db";
import { processLecture } from "@/lib/analysis/lecture";
import { makeTerm } from "@/lib/format";

async function me() {
  const u = await currentUser();
  if (!u) redirect("/");
  return u;
}
async function staffOfClass(code: string) {
  const u = await me();
  const c = await getClassByCode(code);
  if (!c || !isStaffRole(await getRole(c.id, u.id))) throw new Error("Not allowed");
  return { u, c };
}
async function staffOfLecture(code: string) {
  const u = await me();
  const s = await getSession(code);
  if (!s?.class_id || !isStaffRole(await getRole(s.class_id, u.id))) throw new Error("Not allowed");
  return { u, s };
}
async function staffOfHotspot(id: number) {
  const h = await getHotspot(id);
  if (!h) throw new Error("Not found");
  const s = (await getSessionById(h.session_id))!;
  await staffOfLecture(s.code);
  return { h, s };
}
const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const dateMs = (v: string) => (v ? new Date(`${v}T12:00:00`).getTime() || null : null);

// ---------- account ----------

export async function becomeProfessor() {
  const u = await me();
  await setUserKind(u.id, "professor");
  redirect("/teach");
}

export async function savePrefs(p: Partial<Pick<Prefs, "notify_lecture" | "study_reminder" | "dark_live" | "seen_anon_note">>) {
  const u = await me();
  await setPrefs(u.id, p);
  revalidatePath("/app/profile");
}

export async function setMyExamDate(classCode: string, date: string) {
  const u = await me();
  const c = await getClassByCode(classCode);
  if (!c || !(await getRole(c.id, u.id))) return;
  const prefs = await getPrefs(u.id);
  const d = dateMs(date);
  const exam_dates = { ...prefs.exam_dates };
  if (d) exam_dates[String(c.id)] = d;
  else delete exam_dates[String(c.id)];
  await setPrefs(u.id, { exam_dates });
  revalidatePath("/app/study");
}

export async function deleteMyData() {
  const u = await me();
  await deleteUserData(u.id);
  await signOut();
  redirect("/?deleted=1");
}

export async function logOut() {
  await signOut();
  redirect("/");
}

// ---------- students ----------

/** Joins with a class code (once per class), a TA staff code, or a one-off lecture code. */
export async function joinWithCode(_: unknown, f: FormData): Promise<{ error?: string }> {
  const u = await me();
  const code = str(f, "code", 20).replace(/\s+/g, "").toUpperCase();
  if (!code) return { error: "Enter the code your professor is showing." };
  const c = await getClassByCode(code);
  if (c) {
    await addMembership(c.id, u.id, "student");
    const now = await liveSessionsForClasses([c.id]);
    redirect(now[0] ? `/app/live/${now[0].code}` : `/app/class/${c.code}`);
  }
  const staff = await getClassByStaffCode(code);
  if (staff) {
    await addMembership(staff.id, u.id, "ta");
    redirect(`/teach/${staff.code}`);
  }
  const s = await getSession(code);
  if (s?.class_id) {
    await addMembership(s.class_id, u.id, "student");
    redirect(s.ended_at ? `/app/lecture/${s.code}` : `/app/live/${s.code}`);
  }
  return { error: "No class or lecture with that code. Check it and try again." };
}

/** A student opened a published clarification (and maybe marked it "Got it"). */
export async function viewClarification(hotspotId: number, gotIt = false) {
  const u = await me();
  const h = await getHotspot(hotspotId);
  if (!h || h.status !== "published") return;
  const s = (await getSessionById(h.session_id))!;
  if (!s.class_id || (await getRole(s.class_id, u.id)) !== "student") return;
  await recordHotspotView(h.id, userActorId(u.id), gotIt);
}

// ---------- professors: classes ----------

export async function newClass(_: unknown, f: FormData): Promise<{ error?: string }> {
  const u = await me();
  const short = str(f, "short", 30);
  const long = str(f, "long", 80);
  const term = makeTerm(str(f, "quarter", 10), str(f, "year", 4));
  if (!short) return { error: "Give the class a course code, like CSE 143." };
  if (u.kind !== "professor") await setUserKind(u.id, "professor");
  const c = await createClass(long ? `${short} · ${long}` : short, term, u.id, dateMs(str(f, "audio_delete_on", 12)));
  redirect(`/teach/${c.code}`);
}

export async function saveClassSettings(code: string, _: unknown, f: FormData): Promise<{ ok?: boolean; error?: string }> {
  const { c } = await staffOfClass(code);
  const short = str(f, "short", 30);
  if (!short) return { error: "The course code can't be empty." };
  const long = str(f, "long", 80);
  await updateClass(c.id, {
    name: long ? `${short} · ${long}` : short,
    term: makeTerm(str(f, "quarter", 10), str(f, "year", 4)),
    exam_name: str(f, "exam_name", 40),
    exam_date: dateMs(str(f, "exam_date", 12)),
    audio_delete_on: dateMs(str(f, "audio_delete_on", 12)),
    graded_notes: str(f, "graded_notes", 4000),
  });
  revalidatePath(`/teach/${code}`, "layout");
  return { ok: true };
}

export async function newClassCode(code: string) {
  const { c } = await staffOfClass(code);
  if ((await getRole(c.id, (await me()).id)) !== "instructor") throw new Error("Only the instructor can do that");
  const next = await regenerateClassCode(c.id);
  redirect(`/teach/${next}/settings`);
}

export async function removeStudent(code: string, userId: number) {
  const { c } = await staffOfClass(code);
  await removeMembership(c.id, userId);
  revalidatePath(`/teach/${code}/settings`);
}

// ---------- professors: lectures ----------

export async function startLecture(classCode: string, title: string): Promise<{ code?: string; error?: string }> {
  const { u, c } = await staffOfClass(classCode);
  const t = title.trim().slice(0, 120);
  if (!t) return { error: "Give the lecture a title." };
  const s = await createSession(t, c.name, Date.now(), { classId: c.id, createdBy: u.id });
  return { code: s.code };
}

export async function stopLecture(code: string) {
  const { s } = await staffOfLecture(code);
  await endSession(s.id);
  after(() => processLecture(s.id).catch((e) => console.error("process lecture", e)));
  redirect(`/teach/${(await getClassById(s.class_id!))!.code}/lecture/${code}`);
}

export async function reprocessLecture(code: string) {
  const { s } = await staffOfLecture(code);
  if (!s.ended_at) return;
  await processLecture(s.id);
  revalidatePath("/teach/[class]/lecture/[lecture]", "page");
}

export async function setLiveCount(code: string, on: boolean) {
  const { s } = await staffOfLecture(code);
  await setSessionFields(s.id, { live_count_on: on ? 1 : 0 });
}

export async function removeLecture(code: string) {
  const { s } = await staffOfLecture(code);
  const cls = await getClassById(s.class_id!);
  await deleteSession(s.id);
  redirect(`/teach/${cls!.code}`);
}

// ---------- professors: hotspots & clarifications ----------

export async function publishHotspot(id: number, text: string) {
  await staffOfHotspot(id);
  const t = text.trim().slice(0, 2000);
  if (!t) return { error: "Write the clarification first." };
  await updateHotspot(id, { draft: t, published: t, status: "published", published_at: Date.now() });
  revalidatePath("/teach/[class]/lecture/[lecture]", "page");
  return {};
}
export async function saveDraft(id: number, text: string) {
  await staffOfHotspot(id);
  await updateHotspot(id, { draft: text.trim().slice(0, 2000) });
  revalidatePath("/teach/[class]/lecture/[lecture]", "page");
}
export async function unpublishHotspot(id: number) {
  await staffOfHotspot(id);
  await updateHotspot(id, { status: "draft" });
  revalidatePath("/teach/[class]/lecture/[lecture]", "page");
}
export async function dismissHotspot(id: number, dismissed = true) {
  await staffOfHotspot(id);
  await updateHotspot(id, { status: dismissed ? "dismissed" : "draft" });
  revalidatePath("/teach/[class]/lecture/[lecture]", "page");
}
export async function attachLink(id: number, url: string, title: string) {
  await staffOfHotspot(id);
  const u = url.trim();
  if (u && !/^https?:\/\//i.test(u)) return { error: "Links must start with http:// or https://" };
  await updateHotspot(id, { link_url: u.slice(0, 500), link_title: title.trim().slice(0, 120) });
  revalidatePath("/teach/[class]/lecture/[lecture]", "page");
  return {};
}
export async function addClarification(code: string, _: unknown, f: FormData): Promise<{ error?: string; ok?: boolean }> {
  const { s } = await staffOfLecture(code);
  const text = str(f, "text", 2000);
  if (!text) return { error: "Write the clarification first." };
  const url = str(f, "link_url", 500);
  if (url && !/^https?:\/\//i.test(url)) return { error: "Links must start with http:// or https://" };
  const mmss = str(f, "at", 8).match(/^(\d{1,3}):(\d{2})$/);
  await addManualClarification(s.id, {
    concept: str(f, "concept", 80) || "Clarification",
    text,
    start_ms: mmss ? (Number(mmss[1]) * 60 + Number(mmss[2])) * 1000 : 0,
    link_url: url,
    link_title: str(f, "link_title", 120),
  });
  revalidatePath("/teach/[class]/lecture/[lecture]", "page");
  return { ok: true };
}
