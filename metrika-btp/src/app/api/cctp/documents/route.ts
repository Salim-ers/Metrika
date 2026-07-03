import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDb } from "@/lib/db-init";
import { logTreatment, snapshotVersion, recordIssues, type IssueInput } from "@/lib/journal";
import { ACTOR_ROLES } from "@/lib/fidelity";

export const runtime = "nodejs";

interface SectionInput { lot: string; content: string; validated?: boolean }
interface ActorInput {
  role: string; value: string; source_file?: string; source_page?: string;
  sourceFile?: string; sourcePage?: string; confidence?: string; status?: string;
}

/** GET : liste des CCTP sauvegardés (filtre projectId optionnel). */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
  const cctps = await prisma.cctp.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: { updatedAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      _count: { select: { sections: true, dpgfs: true } },
    },
  });
  return NextResponse.json({ cctps });
}

/**
 * POST : sauvegarde un CCTP généré (document + sections + intervenants projet
 * + snapshot de version + journal). C'est la porte d'entrée de la navigation
 * connectée : le CCTP persisté est ensuite chaînable vers le DPGF.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();

  const body = await req.json();
  const {
    title, projectId, projectType, mode, jurisdiction, meta, planContext,
    sections, actors, issues,
  } = body as {
    title?: string; projectId?: string | null; projectType?: string;
    mode?: string; jurisdiction?: string; meta?: Record<string, unknown>;
    planContext?: string; sections?: SectionInput[]; actors?: ActorInput[];
    issues?: IssueInput[];
  };

  const secs = Array.isArray(sections) ? sections.filter((s) => s && typeof s.content === "string" && s.lot) : [];
  if (secs.length === 0) {
    return NextResponse.json({ error: "Aucune section CCTP à sauvegarder." }, { status: 400 });
  }
  if (projectId) {
    const p = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!p) return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  try {
    const cctp = await prisma.cctp.create({
      data: {
        title: (title || "CCTP").slice(0, 300),
        projectType: projectType || null,
        projectId: projectId || null,
        status: secs.every((s) => s.validated) ? "PENDING_REVIEW" : "DRAFT",
        mode: mode === "enrichi" ? "enrichi" : "fidele",
        jurisdiction: jurisdiction === "France" || jurisdiction === "Mixte" ? jurisdiction : "Maroc",
        meta: meta ? JSON.stringify(meta).slice(0, 20000) : null,
        planContext: typeof planContext === "string" ? planContext.slice(0, 100000) : null,
        sections: {
          create: secs.map((s, i) => ({
            lot: s.lot.slice(0, 200),
            order: i,
            content: s.content,
            validated: !!s.validated,
          })),
        },
      },
      include: { sections: { orderBy: { order: "asc" }, select: { id: true, lot: true, order: true, validated: true } } },
    });

    // Table des intervenants du projet (si projet + table fournie).
    if (projectId && Array.isArray(actors)) {
      for (const a of actors) {
        if (!a?.role || !(a.role in ACTOR_ROLES)) continue;
        const data = {
          value: (a.value || "Non renseigné dans les pièces fournies").slice(0, 500),
          sourceFile: (a.sourceFile ?? a.source_file)?.slice(0, 300) ?? null,
          sourcePage: (a.sourcePage ?? a.source_page)?.slice(0, 50) ?? null,
          confidence: ["high", "medium", "low"].includes(a.confidence ?? "") ? (a.confidence as string) : "medium",
          status: ["confirmed", "inferred", "missing"].includes(a.status ?? "") ? (a.status as string) : "missing",
        };
        await prisma.projectActor.upsert({
          where: { projectId_role: { projectId, role: a.role } },
          update: data,
          create: { projectId, role: a.role, ...data },
        });
      }
    }

    // Registre qualité + snapshot + journal (fail-safe).
    if (Array.isArray(issues) && issues.length) {
      await recordIssues({ projectId, docType: "CCTP", docId: cctp.id, issues });
    }
    await snapshotVersion({
      docType: "CCTP", docId: cctp.id, version: cctp.version, indice: cctp.indice,
      trigger: "generation",
      payload: { title: cctp.title, mode: cctp.mode, jurisdiction: cctp.jurisdiction, meta, sections: secs },
    });
    await logTreatment({
      agent: "CCTP", action: `Sauvegarde CCTP « ${cctp.title} »`,
      outputMeta: { cctpId: cctp.id, sections: secs.length, projectId },
    });

    return NextResponse.json({ cctp });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sauvegarde impossible." },
      { status: 500 },
    );
  }
}
