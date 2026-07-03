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

/** Tableau de chaînes → JSON string (colonnes String?), null si absent. */
function jsonList(v: unknown): string | null {
  if (!Array.isArray(v)) return null;
  return JSON.stringify(v.map((x) => String(x)));
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

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const dpgfId = searchParams.get("dpgfId");
    const projectId = searchParams.get("projectId");
    const where: Prisma.SousDetailWhereInput = {};
    if (dpgfId) where.dpgfLine = { dpgfId };
    else if (projectId) where.dpgfLine = { dpgf: { projectId } };

    const sousDetails = await prisma.sousDetail.findMany({
      where,
      include: {
        components: true,
        dpgfLine: {
          select: {
            id: true, code: true, designation: true, unit: true,
            quantity: true, unitPrice: true, lot: true, dpgfId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ sousDetails });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur lors du chargement des sous-détails." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const dpgfLineId = str(body.dpgfLineId);
  try {
    // Ligne CDPGF/DPGF source éventuelle
    let line: { id: string; designation: string; unit: string; quantity: number; unitPrice: number; lot: string } | null = null;
    if (dpgfLineId) {
      line = await prisma.dpgfLine.findUnique({
        where: { id: dpgfLineId },
        select: { id: true, designation: true, unit: true, quantity: true, unitPrice: true, lot: true },
      });
      if (!line) return NextResponse.json({ error: "Ligne DPGF introuvable." }, { status: 404 });

      const existing = await prisma.sousDetail.findUnique({ where: { dpgfLineId }, select: { id: true } });
      if (existing) {
        return NextResponse.json(
          { error: "Un sous-détail existe déjà pour cette ligne.", existingId: existing.id },
          { status: 409 }
        );
      }
    }

    // Valeurs par défaut héritées de la ligne source
    const designation = str(body.designation) ?? line?.designation;
    if (!designation) return NextResponse.json({ error: "La désignation est requise." }, { status: 400 });
    const unit = str(body.unit) ?? line?.unit ?? "U";
    const lot = str(body.lot) ?? line?.lot ?? null;
    const quantity = num(body.quantity) ?? line?.quantity ?? 0;
    const yieldValue = num(body.yield) ?? 1;
    const wasteRate = num(body.wasteRate) ?? 0;
    const generalFeesRate = num(body.generalFeesRate) ?? 0.10;
    const profitRate = num(body.profitRate) ?? 0.10;
    let targetPrice = num(body.targetPrice) ?? null;
    if (targetPrice === null && line && line.unitPrice > 0) targetPrice = line.unitPrice;

    const parsed = body.components === undefined
      ? { components: [] as ComponentInput[] }
      : parseComponents(body.components);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const components = parsed.components;

    // Recalcul serveur systématique : le client ne fournit jamais les montants
    const calc = computeSousDetail({ components, wasteRate, generalFeesRate, profitRate, targetPrice });

    const sousDetail = await prisma.sousDetail.create({
      data: {
        dpgfLineId: line?.id ?? null,
        designation,
        unit,
        lot,
        quantity,
        yield: yieldValue,
        wasteRate,
        generalFeesRate,
        profitRate,
        targetPrice,
        debourseSec: calc.debourseSec,
        sellingPrice: calc.sellingPrice,
        hypotheses: jsonList(body.hypotheses),
        sources: jsonList(body.sources),
        pointsToVerify: jsonList(body.pointsToVerify),
        components: components.length ? { create: components } : undefined,
      },
      include: {
        components: true,
        dpgfLine: { select: { id: true, code: true, designation: true, dpgfId: true } },
      },
    });

    await snapshotVersion({
      docType: "SOUS_DETAIL",
      docId: sousDetail.id,
      version: 1,
      trigger: "generation",
      payload: sousDetail,
    });

    return NextResponse.json({ sousDetail });
  } catch (e) {
    // Course sur la contrainte unique dpgfLineId → conflit, pas erreur serveur
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      const existing = dpgfLineId
        ? await prisma.sousDetail.findUnique({ where: { dpgfLineId }, select: { id: true } }).catch(() => null)
        : null;
      return NextResponse.json(
        { error: "Un sous-détail existe déjà pour cette ligne.", ...(existing ? { existingId: existing.id } : {}) },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur lors de la création du sous-détail." },
      { status: 500 }
    );
  }
}
