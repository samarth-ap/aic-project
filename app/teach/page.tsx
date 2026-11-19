import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server";
import { staffClasses } from "@/lib/views";

export default async function Teach() {
  const u = await requireUser("/teach");
  const classes = await staffClasses(u);
  redirect(classes.length ? `/teach/${classes[0].code}` : "/teach/new");
}
