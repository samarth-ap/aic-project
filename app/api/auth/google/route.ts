import { NextResponse } from "next/server";
import { googleAuthUrl, googleConfigured } from "@/lib/auth";

// GET /api/auth/google?next=/home -> Google's sign-in page
export async function GET(req: Request) {
  const next = new URL(req.url).searchParams.get("next") ?? "/home";
  if (!googleConfigured()) return NextResponse.redirect(new URL(`/?error=${encodeURIComponent("Google sign-in isn't set up on this server yet.")}`, req.url));
  return NextResponse.redirect(await googleAuthUrl(req, next));
}
