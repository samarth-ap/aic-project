import { signOut } from "@/lib/auth";
import { json } from "@/lib/server";

export async function POST() {
  await signOut();
  return json({ ok: true });
}
