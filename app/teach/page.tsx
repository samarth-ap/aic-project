import { redirect } from "next/navigation";
import { emailAllowed } from "@/lib/access";
import { requireUser } from "@/lib/server";
import { staffClasses } from "@/lib/views";

export default async function Teach() {
  const u = await requireUser("/teach");
  if (!emailAllowed(u.email)) redirect("/app");
  const classes = await staffClasses(u);
  redirect(classes.length ? `/teach/${classes[0].code}` : "/teach/new");
}
