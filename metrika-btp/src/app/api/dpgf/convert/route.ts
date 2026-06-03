import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cctpToDpgf } from "@/services/dpgf.service";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { cctpText, planNotes } = await req.json();
  if (!cctpText) return NextResponse.json({ error: "Texte CCTP requis." }, { status: 400 });
  try {
    const lines = await cctpToDpgf({ cctpText, planNotes });
    return NextResponse.json({ lines });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur de conversion" },
      { status: 500 }
    );
  }
}
