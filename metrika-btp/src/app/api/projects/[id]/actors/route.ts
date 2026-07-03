import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDb } from "@/lib/db-init";
import { ACTOR_ORDER, ACTOR_ROLES, NOT_FOUND_LABELS, type ActorRole } from "@/lib/fidelity";

export const runtime = "nodejs";

const CONFIDENCES = ["high", "medium", "low"] as const;
const ACTOR_STATUSES = ["confirmed", "inferred", "missing"] as const;

/** Trie les intervenants selon l'ordre canonique (rôles inconnus en fin de liste). */
function sortByCanonicalOrder<T extends { role: string }>(actors: T[]): T[] {
  const rank = (role: string) => {
    const i = ACTOR_ORDER.indexOf(role as ActorRole);
    return i === -1 ? ACTOR_ORDER.length : i;
  };
  return [...actors].sort((a, b) => rank(a.role) - rank(b.role));
}

/** Normalise une valeur optionnelle en chaîne non vide, sinon null. */
function asString(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
    const actors = await prisma.projectActor.findMany({ where: { projectId: id } });
    return NextResponse.json({ actors: sortByCanonicalOrder(actors) });
  } catch (e) {
    return NextResponse.json({ error: "Erreur lors du chargement des intervenants : " + (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    await ensureDb();
    const { id } = await params;
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });

    const body: unknown = await req.json().catch(() => null);
    const actorsInput = body && typeof body === "object" ? (body as Record<string, unknown>).actors : undefined;
    if (!Array.isArray(actorsInput)) {
      return NextResponse.json({ error: "La liste des intervenants (actors) est requise." }, { status: 400 });
    }

    // Indexe les lignes valides par rôle canonique (rôle inconnu → ligne ignorée).
    const byRole = new Map<ActorRole, Record<string, unknown>>();
    for (const raw of actorsInput) {
      if (typeof raw !== "object" || raw === null) continue;
      const line = raw as Record<string, unknown>;
      const role = line.role;
      if (typeof role !== "string" || !(role in ACTOR_ROLES)) continue;
      if (!byRole.has(role as ActorRole)) byRole.set(role as ActorRole, line);
    }

    // Table unique : chaque rôle canonique est présent exactement une fois.
    for (const role of ACTOR_ORDER) {
      const line = byRole.get(role) ?? {};
      const confidence = typeof line.confidence === "string" && (CONFIDENCES as readonly string[]).includes(line.confidence)
        ? line.confidence : "medium";
      const status = typeof line.status === "string" && (ACTOR_STATUSES as readonly string[]).includes(line.status)
        ? line.status : "missing";
      const data = {
        value: asString(line.value) ?? NOT_FOUND_LABELS.identity,
        sourceFile: asString(line.sourceFile),
        sourcePage: asString(line.sourcePage),
        confidence,
        status,
        notes: asString(line.notes),
      };
      await prisma.projectActor.upsert({
        where: { projectId_role: { projectId: id, role } },
        create: { projectId: id, role, ...data },
        update: data,
      });
    }

    const actors = await prisma.projectActor.findMany({ where: { projectId: id } });
    return NextResponse.json({ actors: sortByCanonicalOrder(actors) });
  } catch (e) {
    return NextResponse.json({ error: "Erreur lors de l'enregistrement des intervenants : " + (e as Error).message }, { status: 500 });
  }
}
