import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateCctp, analyzePlans, type PlanImage } from "@/services/cctp.service";
import { imagePayloadError } from "@/lib/upload-guard";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { lots, projectType, context, planImages } = await req.json();
  if (!Array.isArray(lots) || lots.length === 0) {
    return NextResponse.json({ error: "Sélectionnez au moins un lot." }, { status: 400 });
  }
  const images: PlanImage[] = Array.isArray(planImages) ? planImages : [];
  const tooBig = imagePayloadError(images);
  if (tooBig) return NextResponse.json({ error: tooBig }, { status: 413 });
  try {
    const planContext = await analyzePlans(images);
    const sections = await generateCctp({ lots, projectType, context, planContext });
    return NextResponse.json({ sections, planContext });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur de génération" },
      { status: 500 }
    );
  }
}
