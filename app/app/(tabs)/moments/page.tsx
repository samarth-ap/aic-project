import { requireUser } from "@/lib/server";
import { myMoments } from "@/lib/views";
import MomentsList from "./MomentsList";

export const dynamic = "force-dynamic";

export default async function Moments() {
  const u = await requireUser("/app/moments");
  const v = await myMoments(u);
  return (
    <>
      <h1 className="page-title">My moments</h1>
      <MomentsList v={v} />
    </>
  );
}
