import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cctpToDpgf, type PlanImage } from "@/services/dpgf.service";
import { imagePayloadError } from "@/lib/upload-guard";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { cctpText, planNotes, officialCdpgf, cctpImages } = await req.json();
  const images: PlanImage[] = Array.isArray(cctpImages) ? cctpImages : [];
  if (!cctpText?.trim() && images.length === 0 && !officialCdpgf?.trim()) {
    return NextResponse.json({ error: "Fournissez le CCTP (ou un CDPGF officiel) : un PDF ou du texte collé." }, { status: 400 });
  }
  const tooBig = imagePayloadError(images);
  if (tooBig) return NextResponse.json({ error: tooBig }, { status: 413 });
  // Cap large mais réel (limite de contexte du modèle) pour le texte extrait.
  const textLen = (typeof cctpText === "string" ? cctpText.length : 0) + (typeof officialCdpgf === "string" ? officialCdpgf.length : 0);
  if (textLen > 800_000) {
    return NextResponse.json(
      { error: "Documents texte trop longs (dépassent la fenêtre de contexte). Scindez par lots." },
      { status: 413 },
    );
  }
  try {
    const { lines, provisional, currency, structureDiff } = await cctpToDpgf({ cctpText, planNotes, officialCdpgf, images });
    return NextResponse.json({ lines, provisional, currency, structureDiff });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur de conversion" },
      { status: 500 }
    );
  }
}
