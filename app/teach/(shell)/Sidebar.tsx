"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar({ classes, name }: { classes: { code: string; short: string }[]; name: string }) {
  const path = usePathname();
  const current = path.match(/^\/teach\/([A-Z0-9]{6})/)?.[1];
  return (
    <aside className="side">
      <Link className="brand" href="/teach">Lost <span>and found</span></Link>
      <h4>Classes</h4>
      {classes.map((c) => (
        <div key={c.code}>
          <Link className={`item ${current === c.code && !path.endsWith("/trends") && !path.endsWith("/settings") ? "on" : ""}`} href={`/teach/${c.code}`}>{c.short}</Link>
          {current === c.code && (
            <>
              <Link className={`item sub ${path.endsWith("/trends") ? "on" : ""}`} href={`/teach/${c.code}/trends`}>Term trends</Link>
              <Link className={`item sub ${path.endsWith("/settings") ? "on" : ""}`} href={`/teach/${c.code}/settings`}>Edit class</Link>
            </>
          )}
        </div>
      ))}
      <Link className={`item new ${path === "/teach/new" ? "on" : ""}`} href="/teach/new">New class</Link>
      <div className="foot muted">
        <p style={{ overflowWrap: "anywhere" }}>{name}</p>
        <form action="/api/auth/logout" method="post" onSubmit={async (e) => { e.preventDefault(); await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/"; }}>
          <button className="linkbtn small" style={{ marginTop: 4 }}>Sign out</button>
        </form>
      </div>
    </aside>
  );
}
