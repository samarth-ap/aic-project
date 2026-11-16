import { signOut } from "@/lib/auth";
import { json } from "@/lib/api";

export async function POST() {
  await signOut();
  return json({ ok: true });
}
