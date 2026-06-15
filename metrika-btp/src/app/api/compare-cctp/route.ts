import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { compareCctp } from "@/services/compare-cctp.service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { cctpA, cctpB } = await req.json();
  if (!cctpA?.trim() || !cctpB?.trim()) {
    return NextResponse.json({ error: "Fournissez les deux versions du CCTP (texte ou PDF)." }, { status: 400 });
  }
  if (String(cctpA).length + String(cctpB).length > 400_000) {
    return NextResponse.json({ error: "Documents trop volumineux. Scindez ou réduisez." }, { status: 413 });
  }
  try {
    const result = await compareCctp({ cctpA, cctpB });
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Comparaison impossible" }, { status: 500 });
  }
}
