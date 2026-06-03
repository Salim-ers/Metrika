import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { suggestPrice } from "@/services/pricing.service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { designation, lot } = await req.json();
  if (!designation) return NextResponse.json({ error: "Désignation requise." }, { status: 400 });
  try {
    const result = await suggestPrice(designation, lot);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur de proposition" },
      { status: 500 }
    );
  }
}
