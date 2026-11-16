import { getClassByCode, getRole, getStudyPlan, myTutorQuestions, saveStudyPlan, sessionsForClass, userActorId } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { error, json } from "@/lib/api";
import { myLectures } from "@/lib/classes";
import { buildStudyPlan, offlinePlan, type StudyPlan } from "@/lib/analysis/study";

export const maxDuration = 120;
type Params = { params: Promise<{ code: string }> };

async function load(req: Request, params: Params["params"]) {
  const user = await currentUser(req);
  if (!user) return error("Sign in first", 401);
  const c = await getClassByCode((await params).code);
  if (!c) return error("No class with that code", 404);
  if (!(await getRole(c.id, user.id))) return error("Join this class first", 403);
  return { user, c };
}

// GET -> this student's saved plan (or an instant offline one)
export async function GET(req: Request, { params }: Params) {
  const ctx = await load(req, params);
  if (ctx instanceof Response) return ctx;
  const saved = await getStudyPlan<StudyPlan>(ctx.user.id, ctx.c.id);
  if (saved) return json(saved.plan);
  const lectures = await myLectures(userActorId(ctx.user.id), await sessionsForClass(ctx.c.id));
  return json(offlinePlan(lectures.flatMap((l) => l.my_moments)));
}

// POST -> (re)generate with AI and save. Only the student can see it.
export async function POST(req: Request, { params }: Params) {
  const ctx = await load(req, params);
  if (ctx instanceof Response) return ctx;
  const actor = userActorId(ctx.user.id);
  const sessions = await sessionsForClass(ctx.c.id);
  const lectures = await myLectures(actor, sessions);
  const questions = await myTutorQuestions(actor, sessions.map((s) => s.id));
  const plan = await buildStudyPlan(ctx.c.name, lectures.flatMap((l) => l.my_moments), questions.map((q) => q.text));
  await saveStudyPlan(ctx.user.id, ctx.c.id, plan);
  return json(plan);
}
