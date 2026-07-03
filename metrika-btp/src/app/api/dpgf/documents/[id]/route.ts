import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDb } from "@/lib/db-init";
import { snapshotVersion, logTreatment } from "@/lib/journal";
import type { DpgfLineInput } from "../route";

export const runtime = "nodejs";

const LINE_STATUSES = ["confirmed", "calculated", "to_measure", "inferred", "conflict", "missing"];

/** GET : un DPGF complet (lignes + CCTP source + sous-détails liés). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { id } = await params;
  const dpgf = await prisma.dpgf.findUnique({
    where: { id },
    include: {
      lines: {
        orderBy: { order: "asc" },
        include: {
          sousDetail: { select: { id: true, sellingPrice: true, debourseSec: true, validated: true } },
          cctpSection: { select: { id: true, lot: true, cctpId: true } },
        },
      },
      cctp: { select: { id: true, title: true, sections: { select: { id: true, lot: true, order: true }, orderBy: { order: "asc" } } } },
      project: { select: { id: true, name: true, jurisdiction: true, currency: true, vatRate: true } },
    },
  });
  if (!dpgf) return NextResponse.json({ error: "DPGF introuvable." }, { status: 404 });
  return NextResponse.json({ dpgf });
}

/**
 * PATCH : mise à jour d'un DPGF sauvegardé.
 *  - { lines: [...] }      → remplace les lignes (les lignes verrouillées en base
 *                            sont CONSERVÉES telles quelles : id manquant = recréation,
 *                            donc on réinjecte les lignes locked avant remplacement)
 *  - { title?, mode?, status?, vatRate?, currency? }
 *  - { lockLines: [ids] }  → verrouille des lignes validées
 *  - { newVersion: true }  → version + indice + snapshot
 *  - { lock: true }        → statut VALIDATED + snapshot
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.dpgf.findUnique({ where: { id }, include: { lines: true } });
  if (!existing) return NextResponse.json({ error: "DPGF introuvable." }, { status: 404 });
  if (existing.status === "VALIDATED" && !body.newVersion) {
    return NextResponse.json({ error: "Document verrouillé : créez une nouvelle version pour le modifier." }, { status: 409 });
  }

  try {
    const data: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.slice(0, 300);
    if (body.mode === "dpgf" || body.mode === "cdpgf") data.mode = body.mode;
    if (typeof body.status === "string" && ["DRAFT", "PENDING_REVIEW", "VALIDATED", "ARCHIVED"].includes(body.status)) data.status = body.status;
    if (typeof body.vatRate === "number" && body.vatRate >= 0) data.vatRate = body.vatRate;
    if (typeof body.currency === "string") data.currency = body.currency.slice(0, 20) || null;
    if (body.newVersion) {
      data.version = existing.version + 1;
      data.indice = String.fromCharCode(Math.min(90, (existing.indice?.charCodeAt(0) ?? 65) + 1));
      data.status = "DRAFT";
    }
    if (body.lock) data.status = "VALIDATED";

    // Verrouillage ciblé de lignes (uniquement des lignes validées).
    if (Array.isArray(body.lockLines) && body.lockLines.length) {
      await prisma.dpgfLine.updateMany({
        where: { dpgfId: id, id: { in: body.lockLines }, validated: true },
        data: { locked: true },
      });
    }

    // Remplacement des lignes : les lignes verrouillées en base sont préservées.
    // NB : relire l'état APRÈS lockLines, sinon une ligne tout juste verrouillée
    // serait recréée en doublon (elle survit au deleteMany mais resterait dans
    // la liste entrante).
    if (Array.isArray(body.lines)) {
      const lockedLines = await prisma.dpgfLine.findMany({ where: { dpgfId: id, locked: true } });
      const lockedIds = new Set(lockedLines.map((l) => l.id));
      const incoming = (body.lines as (DpgfLineInput & { id?: string })[])
        .filter((l) => l && l.designation && !(l.id && lockedIds.has(l.id)));

      await prisma.dpgfLine.deleteMany({ where: { dpgfId: id, locked: false } });
      await prisma.dpgfLine.createMany({
        data: incoming.map((l, i) => ({
          dpgfId: id,
          lot: (l.lot || "Sans lot").slice(0, 200),
          code: l.code?.slice(0, 50) ?? null,
          designation: l.designation.slice(0, 1000),
          description: l.description?.slice(0, 4000) ?? null,
          unit: (l.unit || "U").slice(0, 20),
          quantity: Number(l.quantity) || 0,
          unitPrice: Number(l.unitPrice) || 0,
          quantitySource: l.quantitySource?.slice(0, 50) ?? null,
          status: l.status && LINE_STATUSES.includes(l.status) ? l.status : null,
          confidence: ["high", "medium", "low"].includes(l.confidence ?? "") ? l.confidence : null,
          sourceExcerpt: l.sourceExcerpt?.slice(0, 500) ?? null,
          calculation: l.calculation?.slice(0, 500) ?? null,
          priceSource: l.priceSource?.slice(0, 50) ?? null,
          comment: l.comment?.slice(0, 1000) ?? null,
          cctpSectionId: l.cctpSectionId || null,
          cctpArticle: l.cctpArticle?.slice(0, 300) ?? null,
          validated: !!l.validated,
          order: lockedLines.length + i,
        })),
      });
    }

    const dpgf = await prisma.dpgf.update({
      where: { id },
      data,
      include: {
        lines: {
          orderBy: { order: "asc" },
          include: {
            sousDetail: { select: { id: true, sellingPrice: true, validated: true } },
            cctpSection: { select: { id: true, lot: true, cctpId: true } },
          },
        },
      },
    });

    if (body.lock || body.newVersion) {
      await snapshotVersion({
        docType: "DPGF", docId: id, version: dpgf.version, indice: dpgf.indice,
        trigger: body.lock ? "lock" : "save",
        payload: { title: dpgf.title, mode: dpgf.mode, lines: dpgf.lines },
      });
      await logTreatment({
        agent: "DPGF",
        action: body.lock ? `Verrouillage DPGF « ${dpgf.title} »` : `Nouvelle version ${dpgf.version} (indice ${dpgf.indice}) de « ${dpgf.title} »`,
        outputMeta: { dpgfId: id },
      });
    }

    return NextResponse.json({ dpgf });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Mise à jour impossible." },
      { status: 500 },
    );
  }
}

/** DELETE : supprime le DPGF (lignes en cascade). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();
  const { id } = await params;
  try {
    await prisma.dpgf.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "DPGF introuvable." }, { status: 404 });
  }
}
