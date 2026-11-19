import Link from "next/link";
import { classesForUser, getPrefs } from "@/lib/db";
import { requireUser } from "@/lib/server";
import { initials } from "@/lib/format";
import { deleteMyData, logOut } from "@/app/actions";
import { PrefToggle, ConfirmButton } from "./ProfileBits";

export const dynamic = "force-dynamic";

export default async function Profile() {
  const u = await requireUser("/app/profile");
  const [prefs, classes] = await Promise.all([getPrefs(u.id), classesForUser(u.id)]);
  const teaches = classes.some((c) => c.role !== "student");
  return (
    <>
      <h1 className="page-title">Profile</h1>
      <div className="card row" style={{ gap: 16, flexWrap: "nowrap" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--violet)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: "1.1rem", flexShrink: 0 }}>{initials(u.name || u.email)}</div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: "1.1rem" }}>{u.name}</h3>
          <p className="small muted" style={{ overflowWrap: "anywhere" }}>{u.email}</p>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14, padding: "4px 18px" }}>
        <PrefToggle k="notify_lecture" label="Tell me when a lecture starts" on={prefs.notify_lecture} />
        <PrefToggle k="study_reminder" label="Daily study reminder" on={prefs.study_reminder} />
        <PrefToggle k="dark_live" label="Dark screen during lectures" on={prefs.dark_live} last />
      </div>
      <div className="card soft" style={{ marginTop: 14 }}>
        <h3>Your privacy</h3>
        <p className="small muted" style={{ marginTop: 4, lineHeight: 1.55 }}>Professors see how many students were lost, never who. Your chats with the tutor are visible only to you.</p>
      </div>
      <div className="card" style={{ marginTop: 14, padding: "4px 18px" }}>
        <Link href="/app" className="between" style={{ padding: "14px 0", borderBottom: "1px solid var(--border)", color: "var(--text)" }}>
          <span>My classes</span>
          <span className="muted">{classes.length}</span>
        </Link>
        {teaches && (
          <Link href="/teach" className="between" style={{ padding: "14px 0", borderBottom: "1px solid var(--border)", color: "var(--text)" }}>
            <span>Professor view</span>
          </Link>
        )}
        <a href="/api/me/export" className="between" style={{ padding: "14px 0", borderBottom: "1px solid var(--border)", color: "var(--text)" }}>
          <span>Download my chats</span>
        </a>
        <ConfirmButton action={deleteMyData} message="Delete your account, all your tutor chats and Lost moments? This can't be undone." className="linkbtn danger" style={{ padding: "14px 0", display: "block", width: "100%", textAlign: "left", fontWeight: 700 }}>
          Delete my data
        </ConfirmButton>
      </div>
      <form action={logOut} className="center" style={{ marginTop: 20 }}>
        <button className="linkbtn">Sign out</button>
      </form>
    </>
  );
}
