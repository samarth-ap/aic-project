import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server";
import { conceptMap } from "@/lib/views";
import MapView from "./MapView";

export const dynamic = "force-dynamic";

// Concept map: built after each lecture. Solid = what was taught, filled = class hotspot, dashed gold = your questions.
export default async function ConceptMap({ params }: { params: Promise<{ kind: string; code: string }> }) {
  const { kind, code } = await params;
  const u = await requireUser(`/app/map/${kind}/${code}`);
  const v = kind === "lecture" ? await conceptMap(u, { lecture: code }) : kind === "class" ? await conceptMap(u, { cls: code }) : null;
  if (!v) notFound();
  return (
    <main className="app no-tabs dark-screen" style={{ minHeight: "100dvh" }}>
      <div className="app-inner">
        <Link className="back" href={v.back.href} style={{ color: "#cfcaf5" }}>{v.back.label}</Link>
        <h1 style={{ marginTop: 14 }}>Concept map</h1>
        <p className="small" style={{ color: "#cfcaf5", marginTop: 6 }}>Solid: what was taught · Filled: class hotspot · Dashed gold: your questions</p>
        <MapView nodes={v.nodes} />
      </div>
    </main>
  );
}
