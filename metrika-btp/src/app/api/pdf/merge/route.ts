import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mergePdfs, compressPdf } from "@/services/pdf.service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const form = await req.formData();
  const files = form.getAll("files") as File[];
  const order = JSON.parse((form.get("order") as string) || "[]") as number[];
  const compress = form.get("compress") === "true";

  if (files.length < 1) {
    return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
  }

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
