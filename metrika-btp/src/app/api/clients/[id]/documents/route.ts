import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDb } from "@/lib/db-init";

export const runtime = "nodejs";
export const maxDuration = 60;

// Plafond du contenu encodé (data URL) — ~9 Mo de base64 ≈ 6,5 Mo de fichier.
const MAX_DATAURL_CHARS = 9_000_000;

/** Récupère le contenu (data URL) d'un document pour téléchargement/aperçu. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const docId = req.nextUrl.searchParams.get("docId");
  if (!docId) return NextResponse.json({ error: "docId requis." }, { status: 400 });
  const { id } = await params;
  const doc = await prisma.clientDocument.findFirst({ where: { id: docId, clientId: id } });
  if (!doc) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  return NextResponse.json({ document: doc });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Client introuvable." }, { status: 404 });

  const { name, category, mimeType, size, dataUrl } = await req.json();
  if (!name || !dataUrl || typeof dataUrl !== "string") {
    return NextResponse.json({ error: "Nom et contenu du document requis." }, { status: 400 });
  }
  if (dataUrl.length > MAX_DATAURL_CHARS) {
    return NextResponse.json({ error: "Fichier trop volumineux (max ~6 Mo)." }, { status: 413 });
  }
  const doc = await prisma.clientDocument.create({
    data: {
      clientId: id,
      name: String(name),
      category: category ? String(category) : null,
      mimeType: mimeType ? String(mimeType) : null,
      size: typeof size === "number" ? size : null,
      dataUrl,
    },
    select: { id: true, name: true, category: true, mimeType: true, size: true, createdAt: true },
  });
  return NextResponse.json({ document: doc });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();
  const docId = req.nextUrl.searchParams.get("docId");
  if (!docId) return NextResponse.json({ error: "docId requis." }, { status: 400 });
  const { id } = await params;
  await prisma.clientDocument.deleteMany({ where: { id: docId, clientId: id } });
  return NextResponse.json({ ok: true });
}
