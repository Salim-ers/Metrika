import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mergePdfs, compressPdf } from "@/services/pdf.service";
import { validateUploads, safeJsonParse } from "@/lib/upload-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const form = await req.formData();
  const files = form.getAll("files") as File[];
  const order = safeJsonParse<number[]>(form.get("order") as string, []);
  const compress = form.get("compress") === "true";

  const err = validateUploads(files, { allowed: ["application/pdf"] });
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  // Réordonner selon l'ordre demandé par l'utilisateur
  const ordered = order.length === files.length ? order.map((i) => files[i]) : files;

  const loaded = await Promise.all(
    ordered.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))
  );

  let out = await mergePdfs(loaded);
  if (compress) out = await compressPdf(out);

  return new NextResponse(Buffer.from(out), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="metrika-fusion.pdf"',
    },
  });
}
