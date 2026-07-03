import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDb } from "@/lib/db-init";
import { snapshotVersion } from "@/lib/journal";
import { computeSousDetail, type ComponentType } from "@/lib/price-math";

export const runtime = "nodejs";

const COMPONENT_TYPES = ["MAIN_OEUVRE", "MATERIAUX", "MATERIEL", "TRANSPORT"] as const;

function isComponentType(v: string): v is ComponentType {
  return (COMPONENT_TYPES as readonly string[]).includes(v);
}

/** Nombre fini, sinon undefined (jamais de NaN en base). */
function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Chaîne non vide, sinon undefined. */
function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s || undefined;
}

/** Tableau → JSON string ; chaîne déjà sérialisée conservée telle quelle ; sinon null. */
function jsonList(v: unknown): string | null {
  if (Array.isArray(v)) return JSON.stringify(v.map((x) => String(x)));
  if (typeof v === "string" && v.trim()) return v;
  return null;
}

/** JSON string? → tableau de chaînes (tolérant : jamais d'exception). */
function parseList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

interface ComponentInput {
  type: ComponentType;
  designation: string;
  unit: string;
  quantity: number;
  unitCost: number;
  costSource: string | null;
}

/** Valide et normalise les composants reçus. */
function parseComponents(raw: unknown): { components: ComponentInput[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "Le champ components doit être un tableau." };
  const components: ComponentInput[] = [];
  for (const item of raw) {
    const c = (item ?? {}) as Record<string, unknown>;
    const type = String(c.type ?? "");
    if (!isComponentType(type)) {
      return { error: `Type de composant invalide : « ${type || "?"} » (attendu : ${COMPONENT_TYPES.join(", ")}).` };
    }
    components.push({
      type,
      designation: typeof c.designation === "string" ? c.designation.trim() : "",
      unit: str(c.unit) ?? "U",
      quantity: num(c.quantity) ?? 0,
      unitCost: num(c.unitCost) ?? 0,
      costSource: str(c.costSource) ?? null,
    });
  }
  return { components };
}

const FULL_INCLUDE = {
  components: true,
  dpgfLine: {
    select: {
      id: true, code: true, designation: true, unit: true,
      quantity: true, unitPrice: true, lot: true, dpgfId: true,
      dpgf: { select: { id: true, title: true, projectId: true } },
    },
  },
} satisfies Prisma.SousDetailInclude;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { id } = await params;
  try {
    const sousDetail = await prisma.sousDetail.findUnique({ where: { id }, include: FULL_INCLUDE });
    if (!sousDetail) return NextResponse.json({ error: "Sous-détail introuvable." }, { status: 404 });
    // Champs bruts conservés + listes décodées pour le client
    return NextResponse.json({
      sousDetail: {
        ...sousDetail,
        hypothesesList: parseList(sousDetail.hypotheses),
        sourcesList: parseList(sousDetail.sources),
        pointsToVerifyList: parseList(sousDetail.pointsToVerify),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur lors du chargement du sous-détail." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  try {
    const existing = await prisma.sousDetail.findUnique({ where: { id }, include: { components: true } });
    if (!existing) return NextResponse.json({ error: "Sous-détail introuvable." }, { status: 404 });

    // Composants : remplacement complet uniquement si le champ est fourni
    let newComponents: ComponentInput[] | null = null;
    if (body.components !== undefined) {
      const parsed = parseComponents(body.components);
      if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
      newComponents = parsed.components;
    }

    const data: Prisma.SousDetailUpdateInput = {};
    if (body.designation !== undefined) {
      const d = str(body.designation);
      if (!d) return NextResponse.json({ error: "La désignation ne peut pas être vide." }, { status: 400 });
      data.designation = d;
    }
    if (body.unit !== undefined) data.unit = str(body.unit) ?? "U";
    if (body.lot !== undefined) data.lot = str(body.lot) ?? null;
    if (body.quantity !== undefined) data.quantity = num(body.quantity) ?? 0;
    if (body.yield !== undefined) data.yield = num(body.yield) ?? 1;

    // Taux effectifs (fournis ou existants) : servent aussi au recalcul
    const wasteRate = num(body.wasteRate) ?? existing.wasteRate;
    const generalFeesRate = num(body.generalFeesRate) ?? existing.generalFeesRate;
    const profitRate = num(body.profitRate) ?? existing.profitRate;
    if (body.wasteRate !== undefined) data.wasteRate = wasteRate;
    if (body.generalFeesRate !== undefined) data.generalFeesRate = generalFeesRate;
    if (body.profitRate !== undefined) data.profitRate = profitRate;

    let targetPrice = existing.targetPrice;
    if ("targetPrice" in body) {
      targetPrice = num(body.targetPrice) ?? null;
      data.targetPrice = targetPrice;
    }

    if (body.hypotheses !== undefined) data.hypotheses = jsonList(body.hypotheses);
    if (body.sources !== undefined) data.sources = jsonList(body.sources);
    if (body.pointsToVerify !== undefined) data.pointsToVerify = jsonList(body.pointsToVerify);

    if (body.status !== undefined && str(body.status)) data.status = String(body.status).trim();
    const becomesValidated = body.validated === true && !existing.validated;
    if (body.validated !== undefined) data.validated = Boolean(body.validated);
    if (becomesValidated) data.status = "VALIDATED";

    // Recalcul serveur systématique du déboursé sec et du prix de vente
    const calc = computeSousDetail({
      components: newComponents ?? existing.components,
      wasteRate,
      generalFeesRate,
      profitRate,
      targetPrice,
    });
    data.debourseSec = calc.debourseSec;
    data.sellingPrice = calc.sellingPrice;

    await prisma.$transaction(async (tx) => {
      if (newComponents) {
        await tx.sousDetailComponent.deleteMany({ where: { sousDetailId: id } });
        if (newComponents.length) {
          await tx.sousDetailComponent.createMany({
            data: newComponents.map((c) => ({ ...c, sousDetailId: id })),
          });
        }
      }
      await tx.sousDetail.update({ where: { id }, data });
    });

    const sousDetail = await prisma.sousDetail.findUnique({ where: { id }, include: FULL_INCLUDE });

    if (becomesValidated && sousDetail) {
      const last = await prisma.documentVersion
        .findFirst({
          where: { docType: "SOUS_DETAIL", docId: id },
          orderBy: { version: "desc" },
          select: { version: true },
        })
        .catch(() => null);
      await snapshotVersion({
        docType: "SOUS_DETAIL",
        docId: id,
        version: (last?.version ?? 0) + 1,
        trigger: "save",
        payload: sousDetail,
      });
    }

    return NextResponse.json({ sousDetail });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur lors de la mise à jour du sous-détail." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();
  const { id } = await params;
  try {
    // Les composants sont supprimés en cascade (onDelete: Cascade)
    await prisma.sousDetail.delete({ where: { id } }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur lors de la suppression du sous-détail." },
      { status: 500 }
    );
  }
}
