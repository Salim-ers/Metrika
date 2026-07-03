import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateSousDetail, type PlanImage } from "@/services/sous-detail.service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Génère la STRUCTURE d'un sous-détail (composants + hypothèses + points à
 * vérifier). Les coûts unitaires sont toujours à 0 en sortie : ils viennent
 * de la bibliothèque de prix ou de la saisie utilisateur, jamais de l'IA.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { designation, unit, lot, images: imgs } = await req.json();
  const images: PlanImage[] = Array.isArray(imgs) ? imgs : [];
  if (!designation?.trim() && images.length === 0) {
    return NextResponse.json({ error: "Indiquez une désignation ou joignez un PDF." }, { status: 400 });
  }
  try {
    const sd = await generateSousDetail({ designation: designation ?? "", unit: unit ?? "U", lot, images });
    return NextResponse.json(sd);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur de génération" },
      { status: 500 }
    );
  }
}
