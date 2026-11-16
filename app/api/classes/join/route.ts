import { addMembership, getClassByCode, getClassByStaffCode } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { error, json } from "@/lib/api";

// POST /api/classes/join { code } -> joins as a student (class code) or as a TA (staff code).
export async function POST(req: Request) {
  const user = await currentUser(req);
  if (!user) return error("Sign in first", 401);
  const code = String((await req.json().catch(() => ({}))).code ?? "").trim().toUpperCase();
  if (!code) return error("Enter a class code");
  const staff = await getClassByStaffCode(code);
  if (staff) {
    await addMembership(staff.id, user.id, "ta");
    return json({ code: staff.code, role: "ta" });
  }
  const c = await getClassByCode(code);
  if (!c) return error("No class with that code. Lecture codes go on the home page.", 404);
  await addMembership(c.id, user.id, "student");
  return json({ code: c.code, role: "student" });
}
