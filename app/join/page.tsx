import { requireUser } from "@/lib/server";
import JoinForm from "./JoinForm";

export default async function Join() {
  const u = await requireUser("/join");
  return (
    <main className="app no-tabs" style={{ display: "flex", flexDirection: "column" }}>
      <JoinForm signedInAs={u.email} />
    </main>
  );
}
