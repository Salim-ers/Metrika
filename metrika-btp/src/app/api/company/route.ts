import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const FIELDS = [
  "name", "legalForm", "logoUrl", "stampUrl", "ice", "rc", "ifNumber", "cnss",
  "patente", "capital", "country", "currency", "siret", "vatNumber", "ape",
  "address", "city", "phone", "email", "website",
  "bankName", "rib", "iban", "swift", "quotePrefix", "paymentTerms",
] as const;

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const company = await prisma.company.findFirst();
  return NextResponse.json({ company });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const f of FIELDS) if (body[f] !== undefined) data[f] = body[f];
  if (body.vatRate !== undefined) data.vatRate = Number(body.vatRate);

  const existing = await prisma.company.findFirst();
  const company = existing
    ? await prisma.company.update({ where: { id: existing.id }, data })
    : await prisma.company.create({ data: { name: (body.name as string) || "Mon entreprise", ...data } });

  return NextResponse.json({ company });
}
