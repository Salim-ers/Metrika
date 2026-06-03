import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const SELECT = {
  id: true, designation: true, unit: true, unitPrice: true, sellingPrice: true,
  lot: true, category: true, supplier: true, source: true,
  marginRate: true, generalFeesRate: true, updatedAt: true,
} as const;

function normalize(raw: Record<string, unknown>) {
  const unitPrice = Number(raw.unitPrice) || 0;
  const marginRate = raw.marginRate !== undefined ? Number(raw.marginRate) : 0.1;
  const generalFeesRate = raw.generalFeesRate !== undefined ? Number(raw.generalFeesRate) : 0.1;
  const sellingPrice = Math.round(unitPrice * (1 + generalFeesRate) * (1 + marginRate) * 100) / 100;
  return {
    designation: String(raw.designation ?? "").trim(),
    unit: String(raw.unit ?? "U"),
    unitPrice, marginRate, generalFeesRate, sellingPrice,
    lot: raw.lot ? String(raw.lot) : null,
    category: raw.category ? String(raw.category) : null,
    supplier: raw.supplier ? String(raw.supplier) : null,
    source: raw.source ? String(raw.source) : "Saisie manuelle",
  };
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const items = await prisma.priceItem.findMany({ orderBy: { designation: "asc" }, select: SELECT });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const body = await req.json();

  // Import en masse
  if (Array.isArray(body.items)) {
    const data = body.items.map(normalize).filter((d: { designation: string }) => d.designation);
    if (data.length === 0) return NextResponse.json({ error: "Aucune ligne valide." }, { status: 400 });
    await prisma.priceItem.createMany({ data });
    return NextResponse.json({ count: data.length });
  }

  const d = normalize(body);
  if (!d.designation) return NextResponse.json({ error: "Désignation requise." }, { status: 400 });
  const item = await prisma.priceItem.create({ data: d, select: SELECT });
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 });
  await prisma.priceItem.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
