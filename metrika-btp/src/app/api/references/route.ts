import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDb } from "@/lib/db-init";

export const runtime = "nodejs";

const JURISDICTIONS = ["France", "Maroc"] as const;

/** GET : bibliothèque de références réglementaires (filtres juridiction / lot). */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const jurisdiction = req.nextUrl.searchParams.get("jurisdiction");
    const lot = req.nextUrl.searchParams.get("lot");

    const where: Prisma.ReferenceDocWhereInput = {};
    if (jurisdiction) where.jurisdiction = jurisdiction;
    // Les références « tous lots » (lot null) s'appliquent aussi au lot demandé.
    if (lot) where.OR = [{ lot }, { lot: null }];

    const references = await prisma.referenceDoc.findMany({
      where,
      orderBy: [{ jurisdiction: "asc" }, { code: "asc" }],
    });
    return NextResponse.json({ references });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture des références impossible." },
      { status: 500 },
    );
  }
}

/** POST : ajoute une référence à la bibliothèque. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();

  try {
    const body = (await req.json().catch(() => null)) as {
      jurisdiction?: unknown; lot?: unknown; code?: unknown;
      title?: unknown; version?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
    }

    const jurisdiction =
      typeof body.jurisdiction === "string" &&
      (JURISDICTIONS as readonly string[]).includes(body.jurisdiction)
        ? body.jurisdiction
        : null;
    const code = typeof body.code === "string" && body.code.trim() ? body.code.trim() : null;
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;

    if (!jurisdiction) {
      return NextResponse.json({ error: "La juridiction est requise (France ou Maroc)." }, { status: 400 });
    }
    if (!code) {
      return NextResponse.json({ error: "Le code de la référence est requis." }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "Le titre de la référence est requis." }, { status: 400 });
    }

    const reference = await prisma.referenceDoc.create({
      data: {
        jurisdiction,
        lot: typeof body.lot === "string" && body.lot.trim() ? body.lot.trim().slice(0, 200) : null,
        code: code.slice(0, 200),
        title: title.slice(0, 500),
        version: typeof body.version === "string" && body.version.trim() ? body.version.trim().slice(0, 100) : null,
      },
    });
    return NextResponse.json({ reference });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ajout de la référence impossible." },
      { status: 500 },
    );
  }
}

/** DELETE : supprime une référence (query param id). */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "L'identifiant (id) est requis." }, { status: 400 });

  try {
    await prisma.referenceDoc.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Référence introuvable." }, { status: 404 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Suppression de la référence impossible." },
      { status: 500 },
    );
  }
}
