import QRCode from "qrcode";
import { error, sessionFrom } from "@/lib/api";

// GET /api/sessions/:code/qr?origin=https://... -> SVG QR code linking to the student page
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("Not found", 404);
  const url = new URL(req.url);
  const origin = process.env.PUBLIC_URL ?? url.searchParams.get("origin") ?? url.origin;
  const svg = await QRCode.toString(`${origin}/s/${s.code}`, { type: "svg", margin: 1 });
  return new Response(svg, { headers: { "content-type": "image/svg+xml" } });
}
