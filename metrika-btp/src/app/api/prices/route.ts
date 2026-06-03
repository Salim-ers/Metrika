import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Liste la bibliothèque de prix (pour le sélecteur des devis, etc.). */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const items = await prisma.priceItem.findMany({
    orderBy: { designation: "asc" },
    select: {
      id: true, designation: true, unit: true,
      unitPrice: true, sellingPrice: true, lot: true, category: true,
    },
  });
  return NextResponse.json({ items });
}
