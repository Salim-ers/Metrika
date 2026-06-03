import { NextRequest, NextResponse } from "next/server";

// Route de diagnostic TEMPORAIRE (protégée par clé). À supprimer après usage.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("k") !== "metrika-diag-9f3a") {
    return new NextResponse("not found", { status: 404 });
  }
  const key = process.env.ANTHROPIC_API_KEY ?? "";
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const info = { hasKey: !!key, keyPrefix: key.slice(0, 7), keyLen: key.length, model };
  try {
    // Teste le VRAI chemin de génération (tool-use / sortie structurée).
    const { generateCctpSection } = await import("@/services/cctp.service");
    const sec = await generateCctpSection({ lot: "Peinture", projectType: "Logement collectif" });
    return NextResponse.json({
      ...info,
      ok: true,
      lot: sec.lot,
      contentLength: sec.content?.length ?? 0,
      sample: (sec.content ?? "").slice(0, 120),
    });
  } catch (e) {
    const err = e as { message?: string; status?: number; name?: string };
    return NextResponse.json({ ...info, ok: false, error: err?.message, status: err?.status, name: err?.name });
  }
}
