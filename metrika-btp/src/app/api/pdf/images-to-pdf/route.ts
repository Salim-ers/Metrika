import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { imagesToPdf } from "@/services/pdf.service";
import { validateUploads, safeJsonParse } from "@/lib/upload-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const form = await req.formData();
  const files = form.getAll("files") as File[];
  const order = safeJsonParse<number[]>(form.get("order") as string, []);

  const err = validateUploads(files, { allowed: ["image/"] });
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  const ordered = order.length === files.length ? order.map((i) => files[i]) : files;
  const loaded = await Promise.all(
    ordered.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))
  );

  const out = await imagesToPdf(loaded);
  return new NextResponse(Buffer.from(out), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="metrika-images.pdf"',
    },
  });
}
