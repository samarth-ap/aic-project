"use client";
import Link from "next/link";
import { loginHref, logout, type Me } from "@/lib/client";

/** Brand on the left; signed-in user (or a sign-in link) on the right. */
export default function TopBar({ me, right }: { me?: Me; right?: React.ReactNode }) {
  return (
    <header className="topbar">
      <Link className="brand" href={me?.user ? "/dashboard" : "/"}>
        Lost <span>&amp;</span> Found
      </Link>
      <div className="row topbar-right">
        {right}
        {me?.user ? (
          <>
            <Link className="small" href="/dashboard">Dashboard</Link>
            <span className="small muted user-name" title={me.user.email}>{me.user.name}</span>
            <button className="link-btn small" onClick={logout}>Sign out</button>
          </>
        ) : me ? (
          <Link className="small" href={loginHref()}>Sign in</Link>
        ) : null}
      </div>
    </header>
  );
}
