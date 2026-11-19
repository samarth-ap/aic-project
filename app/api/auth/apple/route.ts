import { NextResponse } from "next/server";
import { appleAuthUrl, appleConfigured } from "@/lib/auth";

// GET /api/auth/apple?next=/home -> Apple's sign-in page
export async function GET(req: Request) {
  const next = new URL(req.url).searchParams.get("next") ?? "/home";
  if (!appleConfigured()) return NextResponse.redirect(new URL(`/?error=${encodeURIComponent("Apple sign-in isn't set up on this server yet.")}`, req.url));
  return NextResponse.redirect(await appleAuthUrl(req, next));
}
