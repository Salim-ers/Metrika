import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDb } from "@/lib/db-init";

export const runtime = "nodejs";

/**
 * GET : points de contrôle qualité, filtrés par document (docType + docId)
 * ou par projet (projectId). Non résolus par défaut ; all=1 pour tout.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const sp = req.nextUrl.searchParams;
    const docType = sp.get("docType");
    const docId = sp.get("docId");
    const projectId = sp.get("projectId");

    // docType et docId vont ensemble.
    if ((docType && !docId) || (!docType && docId)) {
      return NextResponse.json(
        { error: "docType et docId doivent être fournis ensemble." },
        { status: 400 },
      );
    }

    const where: Prisma.ValidationIssueWhereInput = {};
    if (sp.get("all") !== "1") where.resolved = false;
    if (docType && docId) {
      where.docType = docType;
      where.docId = docId;
    } else if (projectId) {
      where.projectId = projectId;
    }

    const issues = await prisma.validationIssue.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ issues });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture des points qualité impossible." },
      { status: 500 },
    );
  }
}

/** PATCH : marque un point comme résolu / non résolu. */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();

  try {
    const body = (await req.json().catch(() => null)) as {
      id?: unknown; resolved?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
    }

    const { id, resolved } = body;
    if (typeof id !== "string" || !id) {
      return NextResponse.json({ error: "L'identifiant (id) est requis." }, { status: 400 });
    }
    if (typeof resolved !== "boolean") {
      return NextResponse.json({ error: "Le champ resolved (booléen) est requis." }, { status: 400 });
    }

    const issue = await prisma.validationIssue.update({
      where: { id },
      data: { resolved, resolvedAt: resolved ? new Date() : null },
    });
    return NextResponse.json({ issue });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Point de contrôle introuvable." }, { status: 404 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Mise à jour du point de contrôle impossible." },
      { status: 500 },
    );
  }
}
