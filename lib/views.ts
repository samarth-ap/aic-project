// Data for each screen, assembled on the server.
//
// Privacy: staff views carry counts and shares only (never who tapped Lost);
// student views carry the student's own moments and class aggregates without names.
// Exact counts are hidden from students in small lectures (under 10 joined).
import {
  attendedSessionIds,
  classesForUser,
  countEnrolled,
  eventsForActor,
  eventsForSessions,
  getClassByCode,
  getClassById,
  getPrefs,
  getRole,
  getSession,
  getTranscript,
  hotspotsForSession,
  hotspotsForSessions,
  hotspotViews,
  lectureStatus,
  liveSessionsForClasses,
  presenceCounts,
  purgeExpiredAudio,
  sessionsForClass,
  studyProgress,
  threadsForEvents,
  userActorId,
  type Class,
  type ConfusionEvent,
  type Hotspot,
  type Session,
  type User,
} from "./db";
import { isStaffRole } from "./auth";
import { hashActor, isResolved, parseInsights, type Concept, type LectureInsights } from "./analysis/lecture";
import { shareLabel } from "./analysis/hotspots";
import { buildTopics, planToday, type StudyMoment, type Topic } from "./analysis/study";
import { splitConcept } from "./analysis/tutor";

export const shortName = (c: Pick<Class, "name">) => c.name.split(" · ")[0];
export const longName = (c: Pick<Class, "name">) => c.name.split(" · ").slice(1).join(" · ");

const asc = (ss: Session[]) => [...ss].sort((a, b) => a.started_at - b.started_at);
/** Lecture numbers by session id (1-based, oldest first). */
const numbers = (ss: Session[]) => new Map(asc(ss).map((s, i) => [s.id, i + 1]));
const duration = (s: Session) => (s.ended_at ?? Date.now()) - s.started_at;

export interface HotspotView {
  id: number;
  start_ms: number;
  end_ms: number;
  concept: string;
  students: number;
  share: number;
  share_label: string;
  status: Hotspot["status"];
  published: string;
  link_url: string;
  link_title: string;
  mine: boolean;
}

function hotspotForStudent(h: Hotspot, joined: number, actor: string): HotspotView {
  const actors: string[] = JSON.parse(h.actors_json || "[]");
  return {
    id: h.id,
    start_ms: h.start_ms,
    end_ms: h.end_ms,
    concept: h.concept,
    students: joined < 10 ? 0 : h.students,
    share: joined < 10 ? 0 : h.students / Math.max(joined, 1),
    share_label: h.students ? shareLabel(h.students, joined) : "",
    status: h.status,
    published: h.status === "published" ? h.published : "",
    link_url: h.status === "published" ? h.link_url : "",
    link_title: h.status === "published" ? h.link_title : "",
    mine: actors.includes(hashActor(actor)),
  };
}

// ======================= student =======================

/** Most recently taught first. */
async function byActivity<C extends Class>(classes: C[]): Promise<{ c: C; sessions: Session[] }[]> {
  const all = await Promise.all(classes.map(async (c) => ({ c, sessions: await sessionsForClass(c.id) })));
  return all.sort((a, b) => (b.sessions[0]?.started_at ?? b.c.created_at) - (a.sessions[0]?.started_at ?? a.c.created_at));
}

export async function studentHome(user: User) {
  const all = await byActivity(await classesForUser(user.id));
  const classes = all.map((x) => x.c);
  const actor = userActorId(user.id);
  const live = await liveSessionsForClasses(classes.map((c) => c.id));
  const events = await eventsForActor(actor);
  return {
    live: await Promise.all(
      live.map(async (s) => {
        const c = classes.find((x) => x.id === s.class_id)!;
        const ss = all.find((x) => x.c.id === c.id)!.sessions;
        return { code: s.code, title: s.title, class_short: shortName(c), lecture_no: numbers(ss).get(s.id) ?? 1, started_at: s.started_at };
      }),
    ),
    classes: all.map(({ c, sessions }) => {
      const ids = new Set(sessions.map((s) => s.id));
      return {
        code: c.code,
        name: c.name,
        role: c.role,
        lectures: sessions.length,
        my_lost: events.filter((e) => ids.has(e.session_id)).length,
        live_code: live.find((s) => s.class_id === c.id)?.code ?? null,
      };
    }),
  };
}

/**
 * The student's home dashboard: their own numbers across classes, what to study
 * next and how lost they were in recent lectures. Only ever shown to that student.
 */
export async function studentDashboard(user: User) {
  const home = await studentHome(user);
  const actor = userActorId(user.id);
  const mine = (await classesForUser(user.id)).filter((c) => c.role === "student");
  const [perClass, attended, events] = await Promise.all([
    Promise.all(mine.map(async (c) => ({ c, ss: await sessionsForClass(c.id) }))),
    attendedSessionIds(actor),
    eventsForActor(actor),
  ]);
  const lectures = perClass.flatMap(({ c, ss }) => {
    const nos = numbers(ss);
    return ss.filter((s) => s.ended_at && (attended.has(s.id) || events.some((e) => e.session_id === s.id))).map((s) => ({ s, c, no: nos.get(s.id)! }));
  });
  const inMine = new Set(lectures.map((l) => l.s.id));
  const myEvents = events.filter((e) => inMine.has(e.session_id));
  const recent = lectures
    .sort((a, b) => b.s.started_at - a.s.started_at)
    .slice(0, 6)
    .map(({ s, c, no }) => {
      const ev = myEvents.filter((e) => e.session_id === s.id);
      return {
        code: s.code,
        title: s.title,
        no,
        class_short: shortName(c),
        started_at: s.started_at,
        lost: ev.length,
        fuzzy: ev.filter((e) => e.status === "fuzzy").length,
        got_it: ev.filter((e) => e.status === "got_it").length,
      };
    });
  const plans = await Promise.all(mine.slice(0, 4).map((c) => studyView(user, c.code)));
  const study_next = plans
    .flatMap((v) => (v.cls ? v.plan.slice(0, 2).map((p) => ({ ...p, class_code: v.cls!.code, class_short: v.cls!.short })) : []))
    .slice(0, 4);
  const exams = plans
    .filter((v) => v.cls && v.exam && v.days !== null && v.days !== undefined)
    .map((v) => ({ class_short: v.cls!.short, class_code: v.cls!.code, name: v.exam!.name, days: v.days as number }))
    .sort((a, b) => a.days - b.days);
  return {
    ...home,
    first_name: (user.name || user.email.split("@")[0]).split(" ")[0],
    totals: {
      lectures: lectures.length,
      lost: myEvents.length,
      fuzzy: myEvents.filter((e) => e.status === "fuzzy").length,
      got_it: myEvents.filter((e) => e.status === "got_it").length,
    },
    recent,
    study_next,
    next_exam: exams[0] ?? null,
  };
}

export async function studentClass(user: User, code: string) {
  const c = await getClassByCode(code);
  if (!c || !(await getRole(c.id, user.id))) return null;
  const actor = userActorId(user.id);
  const sessions = await sessionsForClass(c.id);
  const nos = numbers(sessions);
  const [events, hotspots, prefs] = await Promise.all([
    eventsForActor(actor, sessions.map((s) => s.id)),
    hotspotsForSessions(sessions.map((s) => s.id)),
    getPrefs(user.id),
  ]);
  const topics = new Set<string>();
  for (const s of sessions) for (const k of parseInsights(s)?.concepts ?? []) if (k.parent_id) topics.add(k.name.toLowerCase());
  const exam = examFor(c, prefs.exam_dates[String(c.id)]);
  return {
    cls: { code: c.code, short: shortName(c), long: longName(c), term: c.term },
    exam,
    topics: topics.size,
    lectures: sessions.map((s) => ({
      code: s.code,
      no: nos.get(s.id)!,
      title: s.title,
      started_at: s.started_at,
      duration_ms: duration(s),
      status: lectureStatus(s),
      mine: events.filter((e) => e.session_id === s.id).length,
      hotspots: hotspots.filter((h) => h.session_id === s.id && h.status !== "dismissed" && h.students > 0).length,
    })),
  };
}

function examFor(c: Class, own?: number) {
  const date = c.exam_date ?? own ?? null;
  return date ? { name: c.exam_name || "Exam", date, set_by: c.exam_date ? "professor" : "you" } : null;
}

export async function studentLecture(user: User, code: string) {
  const s = await getSession(code);
  if (!s?.class_id) return null;
  const role = await getRole(s.class_id, user.id);
  if (!role) return null;
  const actor = userActorId(user.id);
  const sessions = await sessionsForClass(s.class_id);
  const c = (await getClassById(s.class_id))!;
  await purgeExpiredAudio(c.id);
  const ins = parseInsights(s);
  const joined = ins?.joined ?? (await presenceCounts([s.id])).get(s.id) ?? 0;
  const [hs, events, transcript] = await Promise.all([hotspotsForSession(s.id), eventsForActor(actor, [s.id]), getTranscript(s.id)]);
  const threads = await threadsForEvents(events.map((e) => e.id));
  const hotspots = hs.filter((h) => h.status !== "dismissed").map((h) => hotspotForStudent(h, joined, actor));
  return {
    cls: { code: c.code, short: shortName(c) },
    lecture: {
      code: s.code,
      title: s.title,
      no: numbers(sessions).get(s.id)!,
      duration_ms: ins?.duration_ms ?? duration(s),
      joined,
      joined_label: joined < 10 ? "a few students joined" : `${joined} students joined`,
      status: lectureStatus(s),
      audio_delete_on: c.audio_delete_on,
    },
    buckets: ins?.buckets ?? [],
    hotspots,
    moments: events.map((e) => ({
      id: e.id,
      t_ms: e.t_ms,
      concept: e.concept,
      status: e.status,
      headline: firstAnswer(threads.get(e.id) ?? []),
      hotspot_id: hotspots.find((h) => e.t_ms >= h.start_ms - 30_000 && e.t_ms <= h.end_ms + 30_000)?.id ?? null,
    })),
    transcript: transcript.map((t) => ({ start_ms: t.start_ms, text: t.text })),
  };
}

const firstAnswer = (msgs: { role: string; content: string }[]) => {
  const a = msgs.find((m) => m.role === "assistant");
  return a ? splitConcept(a.content).body.split(/\n+/)[0].slice(0, 220) : "";
};

/** Concept map: per lecture, or for the whole class (lectures as top-level branches). */
export async function conceptMap(user: User, opts: { lecture?: string; cls?: string }) {
  const actor = userActorId(user.id);
  let sessions: Session[] = [];
  let title = "";
  let back = { href: "/app", label: "Classes" };
  if (opts.lecture) {
    const s = await getSession(opts.lecture);
    if (!s?.class_id || !(await getRole(s.class_id, user.id))) return null;
    const no = numbers(await sessionsForClass(s.class_id)).get(s.id)!;
    sessions = [s];
    title = s.title;
    back = { href: `/app/lecture/${s.code}`, label: `Lecture ${no}` };
  } else if (opts.cls) {
    const c = await getClassByCode(opts.cls);
    if (!c || !(await getRole(c.id, user.id))) return null;
    sessions = asc(await sessionsForClass(c.id)).filter((s) => s.processed_at);
    title = shortName(c);
    back = { href: `/app/class/${c.code}`, label: shortName(c) };
  }
  const nos = sessions[0]?.class_id ? numbers(await sessionsForClass(sessions[0].class_id)) : new Map<number, number>();
  const [hs, events] = await Promise.all([hotspotsForSessions(sessions.map((s) => s.id)), eventsForActor(actor, sessions.map((s) => s.id))]);
  const threads = await threadsForEvents(events.map((e) => e.id));
  const nodes: MapNode[] = [];
  for (const s of sessions) {
    const ins = parseInsights(s);
    if (!ins) continue;
    const prefix = opts.cls ? `${s.id}-` : "";
    const lectureRoot = opts.cls ? `${s.id}-lecture` : null;
    if (lectureRoot) nodes.push({ id: lectureRoot, parent: null, name: `${nos.get(s.id)} · ${s.title}`, kind: "lecture", lecture: s.code, t_ms: 0, share: 0, tldr: "", questions: [] });
    const leaves = ins.concepts.filter((k) => k.parent_id);
    const endOf = (k: Concept) => {
      const later = leaves.filter((o) => o.start_ms > k.start_ms).map((o) => o.start_ms);
      return later.length ? Math.min(...later) : ins.duration_ms;
    };
    for (const k of ins.concepts) {
      const isRoot = !k.parent_id;
      if (isRoot && opts.cls) continue;
      const end = endOf(k);
      const inRange = (t: number) => !isRoot && t >= k.start_ms && t < end;
      const hot = hs.filter((h) => h.session_id === s.id && h.status !== "dismissed" && (h.concept.toLowerCase() === k.name.toLowerCase() || inRange(h.start_ms)));
      const best = hot.sort((a, b) => b.students - a.students)[0];
      const mine = events.filter((e) => e.session_id === s.id && (e.concept.toLowerCase() === k.name.toLowerCase() || (!e.concept && inRange(e.t_ms))));
      nodes.push({
        id: prefix + k.id,
        parent: isRoot ? null : k.parent_id === "root" ? lectureRoot ?? prefix + "root" : prefix + k.parent_id,
        name: k.name,
        kind: isRoot ? "root" : "concept",
        lecture: s.code,
        t_ms: k.start_ms,
        share: best && ins.joined >= 10 ? best.students / ins.joined : best ? 0.0001 : 0,
        tldr: best?.status === "published" ? best.published : k.summary,
        questions: mine.map((e) => ({
          event_id: e.id,
          text: firstQuestion(threads.get(e.id) ?? []) || `Lost at ${Math.floor(e.t_ms / 60000)}:${String(Math.floor((e.t_ms % 60000) / 1000)).padStart(2, "0")}`,
          fuzzy: e.status === "fuzzy",
        })),
      });
    }
  }
  return { title, back, nodes, single: Boolean(opts.lecture) };
}
export interface MapNode {
  id: string;
  parent: string | null;
  name: string;
  kind: "root" | "lecture" | "concept";
  lecture: string;
  t_ms: number;
  share: number;
  tldr: string;
  questions: { event_id: number; text: string; fuzzy: boolean }[];
}
const firstQuestion = (msgs: { role: string; kind: string; content: string }[]) =>
  msgs.find((m) => m.role === "user" && m.kind === "text")?.content.slice(0, 90) ?? "";

export async function myMoments(user: User) {
  const actor = userActorId(user.id);
  const classes = await classesForUser(user.id);
  const sessionsByClass = await Promise.all(classes.map(async (c) => ({ c, ss: await sessionsForClass(c.id) })));
  const events = await eventsForActor(actor);
  const threads = await threadsForEvents(events.map((e) => e.id));
  const sessionIds = [...new Set(events.map((e) => e.session_id))];
  const hs = await hotspotsForSessions(sessionIds);
  const groups: {
    key: string;
    class_short: string;
    class_code: string;
    lecture_no: number;
    lecture_title: string;
    lecture_code: string;
    started_at: number;
    items: { id: number; t_ms: number; concept: string; status: ConfusionEvent["status"]; headline: string; messages: number; share_label: string; search: string }[];
  }[] = [];
  for (const { c, ss } of sessionsByClass) {
    const nos = numbers(ss);
    for (const s of ss) {
      const mine = events.filter((e) => e.session_id === s.id).sort((a, b) => b.t_ms - a.t_ms);
      if (!mine.length) continue;
      const joined = parseInsights(s)?.joined ?? 0;
      groups.push({
        key: s.code,
        class_short: shortName(c),
        class_code: c.code,
        lecture_no: nos.get(s.id)!,
        lecture_title: s.title,
        lecture_code: s.code,
        started_at: s.started_at,
        items: mine.map((e) => {
          const msgs = threads.get(e.id) ?? [];
          const h = hs.find((x) => x.session_id === s.id && x.status !== "dismissed" && e.t_ms >= x.start_ms - 30_000 && e.t_ms <= x.end_ms + 30_000);
          return {
            id: e.id,
            t_ms: e.t_ms,
            concept: e.concept,
            status: e.status,
            headline: firstAnswer(msgs),
            messages: msgs.length,
            share_label: h && joined >= 10 ? `${Math.round((h.students / joined) * 100)}% of class was lost here` : "",
            search: [e.concept, ...msgs.map((m) => m.content), s.title, c.name].join(" ").toLowerCase(),
          };
        }),
      });
    }
  }
  groups.sort((a, b) => b.started_at - a.started_at);
  return { groups, total: events.length, fuzzy: events.filter((e) => e.status === "fuzzy").length };
}

export async function studyView(user: User, classCode?: string) {
  const classes = (await byActivity((await classesForUser(user.id)).filter((c) => c.role === "student"))).map((x) => x.c);
  const c = classes.find((x) => x.code === classCode) ?? classes[0];
  if (!c) return { classes: [], cls: null };
  const actor = userActorId(user.id);
  const sessions = asc(await sessionsForClass(c.id));
  const nos = numbers(sessions);
  const [events, hs, progress, prefs] = await Promise.all([
    eventsForActor(actor, sessions.map((s) => s.id)),
    hotspotsForSessions(sessions.map((s) => s.id)),
    studyProgress(user.id),
    getPrefs(user.id),
  ]);
  const moments: StudyMoment[] = events.map((e) => {
    const s = sessions.find((x) => x.id === e.session_id)!;
    const joined = parseInsights(s)?.joined ?? 0;
    const h = hs.find((x) => x.session_id === s.id && x.status !== "dismissed" && e.t_ms >= x.start_ms - 30_000 && e.t_ms <= x.end_ms + 30_000);
    return {
      event_id: e.id,
      concept: e.concept,
      status: e.status,
      t_ms: e.t_ms,
      created_at: e.created_at,
      lecture_code: s.code,
      lecture_no: nos.get(s.id)!,
      lecture_title: s.title,
      class_share: h && joined ? h.students / joined : 0,
    };
  });
  const scoped = new Map([...progress].filter(([k]) => k.startsWith(`${c.id}:`)).map(([k, v]) => [k.slice(String(c.id).length + 1), v]));
  const topics = buildTopics(moments, scoped);
  const exam = examFor(c, prefs.exam_dates[String(c.id)]);
  const days = exam ? Math.max(0, Math.ceil((exam.date - Date.now()) / 86_400_000)) : null;
  const plan = planToday(topics, days);
  const everWeak = topics.filter((t) => t.weak);
  return {
    classes: classes.map((x) => ({ code: x.code, short: shortName(x) })),
    cls: { code: c.code, short: shortName(c), exam_by_prof: Boolean(c.exam_date) },
    exam,
    days,
    lectures_range: sessions.length ? `Lectures 1–${sessions.length}` : "",
    cleared: everWeak.filter((t) => t.cleared).length,
    weak_total: everWeak.length,
    plan: plan.map((p) => ({
      key: p.topic.key,
      name: p.topic.name,
      minutes: p.minutes,
      reason: p.reason,
      kind: p.kind,
      clip: rewatch(p.topic),
      event_id: p.topic.moments[p.topic.moments.length - 1].event_id,
    })),
    standing: topics
      .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name))
      .map((t) => ({ key: t.key, name: t.name, standing: t.standing })),
  };
}
const order = (t: Topic) => (t.standing === "weak" ? 0 : t.standing === "okay" ? 1 : 2);
/** "Rewatch 2 min": from 90 s before the student's latest moment on this topic. */
const rewatch = (t: Topic) => {
  const m = t.moments[t.moments.length - 1];
  return { lecture: m.lecture_code, t_ms: Math.max(0, m.t_ms - 90_000) };
};

// ======================= professor =======================

export async function staffClasses(user: User) {
  return (await byActivity((await classesForUser(user.id)).filter((c) => isStaffRole(c.role)))).map(({ c }) => ({ code: c.code, short: shortName(c), name: c.name, role: c.role }));
}

export async function staffClass(user: User, code: string) {
  const c = await getClassByCode(code);
  if (!c || !isStaffRole(await getRole(c.id, user.id))) return null;
  const sessions = await sessionsForClass(c.id);
  const nos = numbers(sessions);
  const ids = sessions.map((s) => s.id);
  const [hs, enrolled, presence] = await Promise.all([hotspotsForSessions(ids), countEnrolled(c.id), presenceCounts(ids)]);
  const trends = await termTopics(c, sessions, hs);
  return {
    cls: { ...c, short: shortName(c), long: longName(c) },
    enrolled,
    live: sessions.find((s) => !s.ended_at)?.code ?? null,
    drafts: hs.filter((h) => h.status === "draft" && h.students > 0).length,
    first_draft_lecture: sessions.find((s) => hs.some((h) => h.session_id === s.id && h.status === "draft" && h.students > 0))?.code ?? null,
    top_topics: trends.slice(0, 3).map((t) => t.name),
    lectures: sessions.map((s) => {
      const ins = parseInsights(s);
      const mine = hs.filter((h) => h.session_id === s.id && h.students > 0);
      const joined = ins?.joined ?? presence.get(s.id) ?? 0;
      return {
        code: s.code,
        no: nos.get(s.id)!,
        title: s.title,
        started_at: s.started_at,
        status: lectureStatus(s),
        joined,
        lost_share: ins && joined ? ins.stats.students_lost / joined : null,
        hotspots: mine.length,
        published: mine.filter((h) => h.status === "published").length,
        drafts: mine.filter((h) => h.status === "draft").length,
        dismissed: mine.filter((h) => h.status === "dismissed").length,
      };
    }),
  };
}

export async function staffLecture(user: User, code: string) {
  const s = await getSession(code);
  if (!s?.class_id || !isStaffRole(await getRole(s.class_id, user.id))) return null;
  const sessions = await sessionsForClass(s.class_id);
  const c = (await getClassById(s.class_id))!;
  await purgeExpiredAudio(c.id);
  const ins: LectureInsights | null = parseInsights(s);
  const [hs, transcript, events] = await Promise.all([hotspotsForSession(s.id), getTranscript(s.id), eventsForSessions([s.id])]);
  const joined = ins?.joined ?? 0;
  const views = await hotspotViews(hs.map((h) => h.id));
  return {
    cls: { code: c.code, short: shortName(c), audio_delete_on: c.audio_delete_on },
    lecture: {
      code: s.code,
      title: s.title,
      no: numbers(sessions).get(s.id)!,
      status: lectureStatus(s),
      started_at: s.started_at,
      duration_ms: ins?.duration_ms ?? duration(s),
      joined,
      slides_name: s.slides_name,
    },
    insights: ins && {
      mode: ins.mode,
      warning: ins.warning,
      buckets: ins.buckets,
      stats: {
        lost_taps: ins.stats.lost_taps,
        lost_share: joined ? ins.stats.students_lost / joined : 0,
        resolved_share: ins.stats.events ? ins.stats.resolved / ins.stats.events : null,
      },
    },
    resolved_live: events.length ? events.filter(isResolved).length / events.length : null,
    hotspots: hs.map((h) => {
      const v = views.filter((x) => x.hotspot_id === h.id);
      const lostHere = new Set<string>(JSON.parse(h.actors_json || "[]"));
      const openedLost = v.filter((x) => lostHere.has(hashActor(x.actor)));
      return {
        id: h.id,
        rank: h.rank,
        start_ms: h.start_ms,
        end_ms: h.end_ms,
        students: h.students,
        share: joined ? h.students / joined : 0,
        concept: h.concept,
        excerpt: h.excerpt,
        questions: JSON.parse(h.questions_json || "[]") as { text: string; count: number }[],
        draft: h.draft,
        published: h.published,
        status: h.status,
        link_url: h.link_url,
        link_title: h.link_title,
        published_at: h.published_at,
        stats: {
          opened_share: joined ? v.length / joined : 0,
          opened_lost: openedLost.length,
          lost: h.students,
          got_it: openedLost.filter((x) => x.got_it).length,
        },
      };
    }),
    transcript: transcript.map((t) => ({ start_ms: t.start_ms, text: t.text })),
  };
}

/** Topics that keep producing hotspots across the term (grouped by concept name). */
async function termTopics(c: Class, sessions: Session[], hs: Hotspot[]) {
  const nos = numbers(sessions);
  const events = await eventsForSessions(sessions.map((s) => s.id));
  const topics = new Map<string, { name: string; hotspots: Hotspot[] }>();
  for (const h of hs) {
    if (!h.students || !h.concept) continue;
    const k = h.concept.toLowerCase();
    const t = topics.get(k) ?? { name: h.concept, hotspots: [] };
    t.hotspots.push(h);
    topics.set(k, t);
  }
  return [...topics.entries()]
    .map(([k, t]) => {
      const lectureIds = [...new Set(t.hotspots.map((h) => h.session_id))];
      const peak = Math.max(
        ...t.hotspots.map((h) => {
          const j = parseInsights(sessions.find((s) => s.id === h.session_id)!)?.joined ?? 0;
          return j ? h.students / j : 0;
        }),
      );
      return {
        name: t.name,
        hotspots: t.hotspots.length,
        lectures: lectureIds.map((id) => nos.get(id)!).sort((a, b) => a - b),
        peak,
        still_fuzzy: new Set(events.filter((e) => e.status === "fuzzy" && e.concept.toLowerCase() === k).map((e) => e.actor)).size,
        published: t.hotspots.filter((h) => h.status === "published").length,
        drafts: t.hotspots.filter((h) => h.status === "draft").length,
      };
    })
    .sort((a, b) => b.hotspots - a.hotspots || b.peak - a.peak);
}

export async function termTrends(user: User, code: string) {
  const c = await getClassByCode(code);
  if (!c || !isStaffRole(await getRole(c.id, user.id))) return null;
  const sessions = asc(await sessionsForClass(c.id)).filter((s) => s.processed_at);
  const hs = await hotspotsForSessions(sessions.map((s) => s.id));
  const nos = numbers(sessions);
  const perLecture = sessions.map((s) => {
    const ins = parseInsights(s)!;
    return {
      code: s.code,
      no: nos.get(s.id)!,
      title: s.title,
      lost_share: ins.joined ? ins.stats.students_lost / ins.joined : 0,
      resolved: ins.stats.resolved,
      events: ins.stats.events,
    };
  });
  const resolvedShare = (xs: typeof perLecture) => {
    const ev = xs.reduce((n, x) => n + x.events, 0);
    return ev ? xs.reduce((n, x) => n + x.resolved, 0) / ev : null;
  };
  const topics = await termTopics(c, sessions, hs);
  const top2 = [...perLecture].sort((a, b) => b.lost_share - a.lost_share).slice(0, 2);
  return {
    cls: { code: c.code, short: shortName(c), term: c.term, exam_name: c.exam_name || "the exam" },
    lectures: perLecture,
    most_lost: top2,
    resolved_avg: resolvedShare(perLecture),
    resolved_first4: resolvedShare(perLecture.slice(0, 4)),
    topics,
    suggest: topics.filter((t) => t.hotspots > 1 || t.still_fuzzy > 0).slice(0, 2),
  };
}

export { getRole };
