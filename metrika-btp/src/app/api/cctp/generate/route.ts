import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { analyzePlans, generateCctpPass, type PlanImage } from "@/services/cctp.service";
import { extractIntervenants, formatIntervenantsForPrompt } from "@/services/intervenants.service";
import { preauditCctp } from "@/services/cctp-preaudit.service";
import { imagePayloadError } from "@/lib/upload-guard";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Une requête = une seule unité de travail (courte, sous la limite serverless) :
 *  - { analyze: true, planImages }            -> { planContext }
 *  - { intervenants: true, cctpText, ... }    -> { actors, intervenantsTable }
 *  - { preaudit: true, lots, ... }            -> { preaudit }
 *  - { lot, ..., deep, passIndex }            -> { content, passCount, label }
 * L'orchestration (analyse → intervenants → pré-audit → passes) est faite côté client.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await req.json();
  const {
    analyze, planImages, lot, projectType, context, planContext, deep, passIndex, mode,
    intervenants, preaudit, lots, officialCctp, intervenantsTable, cctpText,
  } = body;

  try {
    // ── Mode analyse des plans ──
    if (analyze) {
      const images: PlanImage[] = Array.isArray(planImages) ? planImages : [];
      const tooBig = imagePayloadError(images);
      if (tooBig) return NextResponse.json({ error: tooBig }, { status: 413 });
      const planContextOut = await analyzePlans(images);
      return NextResponse.json({ planContext: planContextOut });
    }

    // ── R2 : table unique des intervenants ──
    if (intervenants) {
      const images: PlanImage[] = Array.isArray(planImages) ? planImages : [];
      const tooBig = imagePayloadError(images);
      if (tooBig) return NextResponse.json({ error: tooBig }, { status: 413 });
      const actors = await extractIntervenants({ cctpText: officialCctp || cctpText, planContext, images });
      return NextResponse.json({ actors, intervenantsTable: formatIntervenantsForPrompt(actors) });
    }

    // ── R7 : rapport d'audit OBLIGATOIRE avant génération ──
    if (preaudit) {
      const result = await preauditCctp({
        lots: Array.isArray(lots) ? lots : [],
        projectType,
        officialCctp,
        planContext,
        context,
      });
      return NextResponse.json({ preaudit: result });
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
        mode: mode === "enrichi" ? "enrichi" : "fidele",
        officialCctp,
        intervenantsTable,
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
