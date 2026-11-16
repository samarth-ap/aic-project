import { NextResponse } from "next/server";
import { finishGoogleLogin, LoginError } from "@/lib/auth";

// Google redirects here after the user picks an account.
export async function GET(req: Request) {
  try {
    const next = await finishGoogleLogin(req);
    return NextResponse.redirect(new URL(next, req.url));
  } catch (e) {
    const msg = e instanceof LoginError ? e.message : "Sign-in failed. Please try again.";
    if (!(e instanceof LoginError)) console.error("login error", e);
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, req.url));
  }
}
