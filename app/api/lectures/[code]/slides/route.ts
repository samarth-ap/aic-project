import { setSessionFields } from "@/lib/db";
import { apiLecture, error, json } from "@/lib/server";

const MAX_BYTES = 25 * 1024 * 1024;

// POST /api/lectures/:code/slides  (professor, multipart "file": PDF, .txt or .md)
// The text goes to the tutor as context.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const a = await apiLecture(req, (await params).code, { staff: true });
  if (a instanceof Response) return a;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return error("Attach a file");
  if (file.size > MAX_BYTES) return error("That file is over 25 MB");
  let text = "";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text: pages } = await extractText(pdf, { mergePages: false });
    text = (pages as string[]).map((p, i) => `[Slide ${i + 1}] ${p.replace(/\s+/g, " ").trim()}`).join("\n");
  } else {
    text = (await file.text()).slice(0, 200_000);
  }
  if (!text.trim()) return error("Couldn't read any text from that file");
  await setSessionFields(a.session.id, { slides_name: file.name.slice(0, 120), slides_text: text.slice(0, 200_000) });
  return json({ ok: true, name: file.name, chars: text.length });
}
