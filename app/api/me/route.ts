import { classesForUser } from "@/lib/db";
import { currentUser, devLoginEnabled, googleConfigured } from "@/lib/auth";
import { json } from "@/lib/api";

// GET /api/me -> who's signed in, their classes, and which sign-in methods exist.
export async function GET(req: Request) {
  const user = await currentUser(req);
  const auth = { google: googleConfigured(), dev: devLoginEnabled() };
  if (!user) return json({ user: null, classes: [], auth });
  const classes = await classesForUser(user.id);
  return json({
    user: { name: user.name, email: user.email, picture: user.picture },
    classes: classes.map((c) => ({
      code: c.code,
      name: c.name,
      term: c.term,
      role: c.role,
      ...(c.role === "instructor" ? { staff_code: c.staff_code } : {}),
    })),
    auth,
  });
}
