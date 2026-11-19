import Link from "next/link";
import { requireUser } from "@/lib/server";
import Check from "./Check";

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ class?: string; topic?: string }> }) {
  const sp = await searchParams;
  await requireUser("/app/study");
  return (
    <>
      <Link className="back" href={`/app/study?class=${sp.class ?? ""}`}>Study</Link>
      <Check classCode={sp.class ?? ""} topic={sp.topic ?? ""} />
    </>
  );
}
