import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractQuoteLines, type PlanImage } from "@/services/quote.service";
import { imagePayloadError } from "@/lib/upload-guard";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { images: imgs } = await req.json();
  const images: PlanImage[] = Array.isArray(imgs) ? imgs : [];
  if (images.length === 0) return NextResponse.json({ error: "Aucun document fourni." }, { status: 400 });
  const tooBig = imagePayloadError(images);
  if (tooBig) return NextResponse.json({ error: tooBig }, { status: 413 });
  try {
    const lines = await extractQuoteLines(images);
    return NextResponse.json({ lines });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Extraction impossible" }, { status: 500 });
  }
}
