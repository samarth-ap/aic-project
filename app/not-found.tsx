import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app no-tabs" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "100dvh" }}>
      <h1>Not found</h1>
      <p className="muted" style={{ marginTop: 10 }}>This page doesn&apos;t exist, or it belongs to a class you&apos;re not in.</p>
      <Link className="btn" href="/home" style={{ marginTop: 24, width: "fit-content" }}>Go home</Link>
    </main>
  );
}
