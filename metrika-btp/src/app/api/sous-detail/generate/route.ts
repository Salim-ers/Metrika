import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateSousDetail, computeSousDetail, type PlanImage } from "@/services/sous-detail.service";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    const totals = computeSousDetail(sd.components, sd.yield, sd.generalFeesRate, sd.profitRate);
    return NextResponse.json({ ...sd, ...totals });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur de génération" },
      { status: 500 }
    );
  }
}
