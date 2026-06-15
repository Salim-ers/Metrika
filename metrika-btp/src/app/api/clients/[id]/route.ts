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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      documents: { orderBy: { createdAt: "desc" }, select: { id: true, name: true, category: true, mimeType: true, size: true, createdAt: true } },
      projects: { orderBy: { createdAt: "desc" } },
      quotes: { orderBy: { createdAt: "desc" }, select: { id: true, number: true, totalTTC: true, status: true, createdAt: true } },
    },
  });
  if (!client) return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
  return NextResponse.json({ client });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();
  const { id } = await params;
  const data = clean(await req.json());
  if (data.name === null) return NextResponse.json({ error: "Le nom est requis." }, { status: 400 });
  const client = await prisma.client.update({ where: { id }, data });
  return NextResponse.json({ client });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();
  const { id } = await params;
  await prisma.client.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
