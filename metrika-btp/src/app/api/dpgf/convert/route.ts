import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cctpToDpgf, type PlanImage } from "@/services/dpgf.service";
import { imagePayloadError } from "@/lib/upload-guard";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { cctpText, planNotes, cctpImages } = await req.json();
  const images: PlanImage[] = Array.isArray(cctpImages) ? cctpImages : [];
  if (!cctpText?.trim() && images.length === 0) {
    return NextResponse.json({ error: "Fournissez le CCTP : un PDF ou du texte collé." }, { status: 400 });
  }
  const tooBig = imagePayloadError(images);
  if (tooBig) return NextResponse.json({ error: tooBig }, { status: 413 });
  try {
    const lines = await cctpToDpgf({ cctpText, planNotes, images });
    return NextResponse.json({ lines });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur de conversion" },
      { status: 500 }
    );
  }
}
