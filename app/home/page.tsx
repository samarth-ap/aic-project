import { redirect } from "next/navigation";
import { classesForUser } from "@/lib/db";
import { isStaffRole } from "@/lib/auth";
import { requireUser } from "@/lib/server";

// Where "home" is: professors go to their classes; students to theirs (or to join one first).
export default async function Home() {
  const u = await requireUser("/home");
  const classes = await classesForUser(u.id);
  if (u.kind === "professor" || classes.some((c) => isStaffRole(c.role))) redirect("/teach");
  redirect(classes.length ? "/app" : "/join");
}
