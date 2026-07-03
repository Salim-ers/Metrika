import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDb } from "@/lib/db-init";
import { snapshotVersion, logTreatment } from "@/lib/journal";

export const runtime = "nodejs";

/** GET : un CCTP complet (sections ordonnées + projet + DPGF liés). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { id } = await params;
  const cctp = await prisma.cctp.findUnique({
    where: { id },
    include: {
      sections: { orderBy: { order: "asc" } },
      project: { select: { id: true, name: true, jurisdiction: true, currency: true, actors: true } },
      dpgfs: { select: { id: true, title: true, status: true, mode: true, updatedAt: true } },
    },
  });
  if (!cctp) return NextResponse.json({ error: "CCTP introuvable." }, { status: 404 });
  return NextResponse.json({ cctp });
}

/**
 * PATCH : mise à jour d'un CCTP sauvegardé.
 *  - { sections: [{ id?, lot, content, validated }] } → remplace le contenu
 *  - { title?, status?, meta? }                       → champs d'en-tête
 *  - { newVersion: true }                             → incrémente version + indice + snapshot
 *  - { lock: true }                                   → statut VALIDATED + snapshot « lock »
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.cctp.findUnique({ where: { id }, include: { sections: true } });
  if (!existing) return NextResponse.json({ error: "CCTP introuvable." }, { status: 404 });
  if (existing.status === "VALIDATED" && !body.newVersion) {
    return NextResponse.json({ error: "Document verrouillé : créez une nouvelle version pour le modifier." }, { status: 409 });
  }

  try {
    const data: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.slice(0, 300);
    if (typeof body.status === "string" && ["DRAFT", "PENDING_REVIEW", "VALIDATED", "ARCHIVED"].includes(body.status)) data.status = body.status;
    if (body.meta && typeof body.meta === "object") data.meta = JSON.stringify(body.meta).slice(0, 20000);

    if (body.newVersion) {
      const nextIndice = String.fromCharCode(Math.min(90, (existing.indice?.charCodeAt(0) ?? 65) + 1)); // A→B→…→Z
      data.version = existing.version + 1;
      data.indice = nextIndice;
      data.status = "DRAFT";
    }
    if (body.lock) data.status = "VALIDATED";

    // Remplacement des sections (édition / validation section par section).
    if (Array.isArray(body.sections)) {
      const secs = (body.sections as { lot?: string; content?: string; validated?: boolean }[])
        .filter((s) => s && typeof s.content === "string" && s.lot);
      await prisma.cctpSection.deleteMany({ where: { cctpId: id } });
      await prisma.cctpSection.createMany({
        data: secs.map((s, i) => ({
          cctpId: id, lot: (s.lot as string).slice(0, 200), order: i,
          content: s.content as string, validated: !!s.validated,
        })),
      });
      if (!body.lock && !body.newVersion && data.status === undefined) {
        data.status = secs.length && secs.every((s) => s.validated) ? "PENDING_REVIEW" : "DRAFT";
      }
    }

    const cctp = await prisma.cctp.update({
      where: { id },
      data,
      include: { sections: { orderBy: { order: "asc" } } },
    });

    if (body.lock || body.newVersion) {
      await snapshotVersion({
        docType: "CCTP", docId: id, version: cctp.version, indice: cctp.indice,
        trigger: body.lock ? "lock" : "save",
        payload: { title: cctp.title, sections: cctp.sections.map((s) => ({ lot: s.lot, content: s.content, validated: s.validated })) },
      });
      await logTreatment({
        agent: "CCTP",
        action: body.lock ? `Verrouillage CCTP « ${cctp.title} »` : `Nouvelle version ${cctp.version} (indice ${cctp.indice}) de « ${cctp.title} »`,
        outputMeta: { cctpId: id },
      });
    }

    return NextResponse.json({ cctp });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Mise à jour impossible." },
      { status: 500 },
    );
  }
}

/** DELETE : supprime le CCTP (sections en cascade ; les DPGF liés sont détachés). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();
  const { id } = await params;
  try {
    await prisma.cctp.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "CCTP introuvable." }, { status: 404 });
  }
}
