import { NextResponse } from "next/server";
import { finishGoogleLogin, LoginError } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    return NextResponse.redirect(new URL(await finishGoogleLogin(req), req.url));
  } catch (e) {
    if (!(e instanceof LoginError)) console.error("google login", e);
    const msg = e instanceof LoginError ? e.message : "Sign-in failed. Please try again.";
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(msg)}`, req.url));
  }
}
