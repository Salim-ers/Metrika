import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDb } from "@/lib/db-init";

export const runtime = "nodejs";

const JURISDICTIONS = ["Maroc", "France", "Mixte"] as const;
const CURRENCIES = ["MAD", "EUR"] as const;
const STATUSES = ["EN_COURS", "DCE", "CONSULTATION", "TRAVAUX", "ARCHIVE"] as const;

interface ProjectInput {
  name?: string;
  reference?: string | null;
  type?: string | null;
  location?: string | null;
  description?: string | null;
  jurisdiction?: string;
  currency?: string | null;
  vatRate?: number | null;
  clientId?: string | null;
  status?: string;
}

/**
 * Valide et normalise le corps de requête (mise à jour partielle : les champs
 * absents sont ignorés, les enums invalides renvoient une erreur).
 */
function parseProjectBody(body: Record<string, unknown>): { data?: ProjectInput; error?: string } {
  const data: ProjectInput = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return { error: "Le nom du projet est requis." };
    data.name = name;
  }

  for (const f of ["reference", "type", "location", "description"] as const) {
    if (body[f] === undefined) continue;
    const v = body[f];
    data[f] = v === null || v === "" ? null : String(v);
  }

  if (body.jurisdiction !== undefined) {
    const j = body.jurisdiction;
    if (j === null || j === "") data.jurisdiction = "Maroc";
    else if (typeof j === "string" && (JURISDICTIONS as readonly string[]).includes(j)) data.jurisdiction = j;
    else return { error: "Juridiction invalide (valeurs acceptées : Maroc, France, Mixte)." };
  }

  if (body.currency !== undefined) {
    const c = body.currency;
    if (c === null || c === "") data.currency = null;
    else if (typeof c === "string" && (CURRENCIES as readonly string[]).includes(c)) data.currency = c;
    else return { error: "Devise invalide (valeurs acceptées : MAD, EUR)." };
  }

  if (body.vatRate !== undefined) {
    const v = body.vatRate;
    if (v === null || v === "") data.vatRate = null;
    else {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return { error: "Le taux de TVA doit être un nombre." };
      data.vatRate = n;
    }
  }

  if (body.clientId !== undefined) {
    const c = body.clientId;
    data.clientId = c === null || c === "" ? null : String(c);
  }

  if (body.status !== undefined) {
    const s = body.status;
    if (s === null || s === "") data.status = "EN_COURS";
    else if (typeof s === "string" && (STATUSES as readonly string[]).includes(s)) data.status = s;
    else return { error: "Statut invalide (valeurs acceptées : EN_COURS, DCE, CONSULTATION, TRAVAUX, ARCHIVE)." };
  }

  return { data };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        actors: { orderBy: { role: "asc" } },
        cctps: {
          orderBy: { updatedAt: "desc" },
          select: {
            id: true, title: true, status: true, mode: true, jurisdiction: true,
            version: true, indice: true, updatedAt: true,
            _count: { select: { sections: true } },
          },
        },
        dpgfs: {
          orderBy: { updatedAt: "desc" },
          select: {
            id: true, title: true, status: true, mode: true, provisional: true,
            currency: true, version: true, indice: true, updatedAt: true, cctpId: true,
            _count: { select: { lines: true } },
          },
        },
        issues: { where: { resolved: false }, orderBy: { createdAt: "desc" }, take: 50 },
        exports: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!project) return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json({ error: "Erreur lors du chargement du projet : " + (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    await ensureDb();
    const { id } = await params;
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
    }
    const { data, error } = parseProjectBody(body as Record<string, unknown>);
    if (error || !data) return NextResponse.json({ error: error ?? "Corps de requête invalide." }, { status: 400 });

    const existing = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });

    if (data.clientId) {
      const client = await prisma.client.findUnique({ where: { id: data.clientId }, select: { id: true } });
      if (!client) return NextResponse.json({ error: "Le client sélectionné est introuvable." }, { status: 400 });
    }

    const project = await prisma.project.update({ where: { id }, data });
    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json({ error: "Erreur lors de la mise à jour du projet : " + (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    await ensureDb();
    const { id } = await params;
    // Suppression idempotente : les relations (SetNull / Cascade) gèrent le reste.
    await prisma.project.delete({ where: { id } }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Erreur lors de la suppression du projet : " + (e as Error).message }, { status: 500 });
  }
}
