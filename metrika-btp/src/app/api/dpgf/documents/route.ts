import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDb } from "@/lib/db-init";
import { logTreatment, snapshotVersion, recordIssues, type IssueInput } from "@/lib/journal";

export const runtime = "nodejs";

export interface DpgfLineInput {
  lot: string; code?: string | null; designation: string; description?: string | null;
  unit: string; quantity?: number; unitPrice?: number;
  quantitySource?: string | null; status?: string | null; confidence?: string | null;
  sourceExcerpt?: string | null; calculation?: string | null; priceSource?: string | null;
  comment?: string | null; cctpSectionId?: string | null; cctpArticle?: string | null;
  validated?: boolean; locked?: boolean;
}

const LINE_STATUSES = ["confirmed", "calculated", "to_measure", "inferred", "conflict", "missing"];

function cleanLine(l: DpgfLineInput, order: number) {
  return {
    lot: (l.lot || "Sans lot").slice(0, 200),
    code: l.code?.slice(0, 50) ?? null,
    designation: (l.designation || "").slice(0, 1000),
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
    locked: !!l.locked,
    order,
  };
}

/** GET : liste des DPGF sauvegardés (filtres projectId / cctpId optionnels). */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const projectId = sp.get("projectId") ?? undefined;
  const cctpId = sp.get("cctpId") ?? undefined;
  const dpgfs = await prisma.dpgf.findMany({
    where: { ...(projectId ? { projectId } : {}), ...(cctpId ? { cctpId } : {}) },
    orderBy: { updatedAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      cctp: { select: { id: true, title: true } },
      _count: { select: { lines: true } },
    },
  });
  return NextResponse.json({ dpgfs });
}

/**
 * POST : sauvegarde un DPGF/CDPGF (document + lignes tracées + lien CCTP
 * + snapshot + journal). Les quantités/prix manquants restent manquants :
 * aucune complétion automatique.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();

  const body = await req.json();
  const {
    title, projectId, cctpId, mode, provisional, currency, vatRate, lines, issues,
  } = body as {
    title?: string; projectId?: string | null; cctpId?: string | null;
    mode?: string; provisional?: boolean; currency?: string | null; vatRate?: number;
    lines?: DpgfLineInput[]; issues?: IssueInput[];
  };

  const lns = Array.isArray(lines) ? lines.filter((l) => l && l.designation) : [];
  if (lns.length === 0) return NextResponse.json({ error: "Aucune ligne DPGF à sauvegarder." }, { status: 400 });

  if (projectId) {
    const p = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!p) return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }
  let resolvedProjectId = projectId || null;
  if (cctpId) {
    const c = await prisma.cctp.findUnique({ where: { id: cctpId }, select: { id: true, projectId: true } });
    if (!c) return NextResponse.json({ error: "CCTP source introuvable." }, { status: 404 });
    if (!resolvedProjectId) resolvedProjectId = c.projectId; // hérite du projet du CCTP
  }

  try {
    const dpgf = await prisma.dpgf.create({
      data: {
        title: (title || "DPGF").slice(0, 300),
        projectId: resolvedProjectId,
        cctpId: cctpId || null,
        mode: mode === "cdpgf" ? "cdpgf" : "dpgf",
        provisional: provisional !== false,
        currency: typeof currency === "string" && currency.trim() ? currency.slice(0, 20) : null,
        vatRate: Number(vatRate) || 20,
        lines: { create: lns.map(cleanLine) },
      },
      include: { lines: { orderBy: { order: "asc" }, select: { id: true, code: true, designation: true, order: true } } },
    });

    if (Array.isArray(issues) && issues.length) {
      await recordIssues({ projectId: resolvedProjectId, docType: "DPGF", docId: dpgf.id, issues });
    }
    await snapshotVersion({
      docType: "DPGF", docId: dpgf.id, version: dpgf.version, indice: dpgf.indice,
      trigger: "generation",
      payload: { title: dpgf.title, mode: dpgf.mode, provisional: dpgf.provisional, lines: lns },
    });
    await logTreatment({
      agent: "DPGF", action: `Sauvegarde DPGF « ${dpgf.title} »`,
      outputMeta: { dpgfId: dpgf.id, lines: lns.length, cctpId, projectId: resolvedProjectId },
    });

    return NextResponse.json({ dpgf });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sauvegarde impossible." },
      { status: 500 },
    );
  }
}
