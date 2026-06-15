import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { auditCctpDpgf } from "@/services/audit.service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { cctpText, dpgfText } = await req.json();
  if (!cctpText?.trim() || !dpgfText?.trim()) {
    return NextResponse.json({ error: "Fournissez le CCTP et le DPGF (texte ou PDF)." }, { status: 400 });
  }
  if (String(cctpText).length + String(dpgfText).length > 400_000) {
    return NextResponse.json({ error: "Documents trop volumineux. Scindez ou réduisez." }, { status: 413 });
  }
  try {
    const result = await auditCctpDpgf({ cctpText, dpgfText });
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Audit impossible" }, { status: 500 });
  }
}
