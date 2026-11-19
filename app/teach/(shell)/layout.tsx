import { requireUser } from "@/lib/server";
import { staffClasses } from "@/lib/views";
import Sidebar from "./Sidebar";

export default async function ProfShell({ children }: { children: React.ReactNode }) {
  const u = await requireUser("/teach");
  const classes = await staffClasses(u);
  return (
    <div className="prof">
      <Sidebar classes={classes} name={u.name} />
      <main className="main">{children}</main>
    </div>
  );
}
