import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateCctp } from "@/services/cctp.service";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { lots, projectType, context } = await req.json();
  if (!Array.isArray(lots) || lots.length === 0) {
    return NextResponse.json({ error: "Sélectionnez au moins un lot." }, { status: 400 });
  }
  try {
    const sections = await generateCctp({ lots, projectType, context });
    return NextResponse.json({ sections });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur de génération" },
      { status: 500 }
    );
  }
}
