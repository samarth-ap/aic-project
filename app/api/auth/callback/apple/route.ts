import { NextResponse } from "next/server";
import { finishAppleLogin, LoginError } from "@/lib/auth";

// Apple posts back here (response_mode=form_post).
export async function POST(req: Request) {
  try {
    return NextResponse.redirect(new URL(await finishAppleLogin(req), req.url), 303);
  } catch (e) {
    if (!(e instanceof LoginError)) console.error("apple login", e);
    const msg = e instanceof LoginError ? e.message : "Sign-in failed. Please try again.";
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(msg)}`, req.url), 303);
  }
}
