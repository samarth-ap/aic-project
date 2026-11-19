import QRCode from "qrcode";
import { getClassByCode } from "@/lib/db";
import { error } from "@/lib/server";

// GET /api/classes/:code/qr -> SVG QR code that opens the app's join screen for this class
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const c = await getClassByCode((await params).code);
  if (!c) return error("Not found", 404);
  const origin = process.env.PUBLIC_URL ?? new URL(req.url).origin;
  const svg = await QRCode.toString(`${origin}/join/${c.code}`, { type: "svg", margin: 0, color: { dark: "#1c1a3aff", light: "#ffffffff" } });
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "no-store" } });
}
