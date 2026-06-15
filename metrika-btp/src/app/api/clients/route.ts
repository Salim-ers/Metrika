import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDb } from "@/lib/db-init";

export const runtime = "nodejs";

const FIELDS = [
  "name", "type", "status", "company", "ice", "contact",
  "address", "city", "region", "phone", "email", "website", "notes",
] as const;

function clean(body: Record<string, unknown>) {
  const out: Record<string, string | null> = {};
  for (const f of FIELDS) {
    if (body[f] === undefined) continue;
    const v = body[f];
    out[f] = v === null || v === "" ? null : String(v);
  }
  return out;
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { documents: true, projects: true, quotes: true } } },
  });
  return NextResponse.json({ clients });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();
  const body = await req.json();
  const data = clean(body);
  if (!data.name) return NextResponse.json({ error: "Le nom du client est requis." }, { status: 400 });
  const client = await prisma.client.create({
    data: { name: data.name, ...data, status: data.status || "PROSPECT" },
  });
  return NextResponse.json({ client });
}
