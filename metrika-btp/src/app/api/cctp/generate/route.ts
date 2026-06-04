import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { analyzePlans, generateCctpPass, type PlanImage } from "@/services/cctp.service";
import { imagePayloadError } from "@/lib/upload-guard";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Une requête = une seule unité de travail (courte, sous la limite serverless) :
 *  - { analyze: true, planImages }     -> { planContext }
 *  - { lot, ..., deep, passIndex }     -> { content, passCount, label }
 * L'orchestration (boucle sur les lots et les passes) est faite côté client.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await req.json();
  const { analyze, planImages, lot, projectType, context, planContext, deep, passIndex } = body;

  try {
    // ── Mode analyse des plans ──
    if (analyze) {
      const images: PlanImage[] = Array.isArray(planImages) ? planImages : [];
      const tooBig = imagePayloadError(images);
      if (tooBig) return NextResponse.json({ error: tooBig }, { status: 413 });
      const planContextOut = await analyzePlans(images);
      return NextResponse.json({ planContext: planContextOut });
    }

    // ── Mode génération d'une passe d'un lot ──
    if (typeof lot === "string" && lot.trim()) {
      const r = await generateCctpPass({
        lot,
        projectType,
        context,
        planContext,
        deep: !!deep,
        passIndex: Number(passIndex) || 0,
      });
      return NextResponse.json(r);
    }

    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur de génération" },
      { status: 500 },
    );
  }
}
