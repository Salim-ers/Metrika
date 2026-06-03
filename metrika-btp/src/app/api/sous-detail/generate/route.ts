import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateSousDetail, computeSousDetail } from "@/services/sous-detail.service";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { designation, unit, lot } = await req.json();
  if (!designation) return NextResponse.json({ error: "Désignation requise." }, { status: 400 });
  try {
    const sd = await generateSousDetail({ designation, unit: unit ?? "U", lot });
    const totals = computeSousDetail(sd.components, sd.yield, sd.generalFeesRate, sd.profitRate);
    return NextResponse.json({ ...sd, ...totals });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur de génération" },
      { status: 500 }
    );
  }
}
