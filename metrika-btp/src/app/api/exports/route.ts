import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDb } from "@/lib/db-init";
import { recordExport, logTreatment } from "@/lib/journal";

export const runtime = "nodejs";

const FORMATS = ["PDF", "DOCX", "XLSX"] as const;
type ExportFormat = (typeof FORMATS)[number];

function parseFormat(v: unknown): ExportFormat | null {
  return typeof v === "string" && (FORMATS as readonly string[]).includes(v)
    ? (v as ExportFormat)
    : null;
}

/** GET : historique des exports (200 derniers). */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const exports = await prisma.exportJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { project: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ exports });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture de l'historique des exports impossible." },
      { status: 500 },
    );
  }
}

/** POST : enregistre un export dans l'historique + journal des traitements. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  await ensureDb();

  try {
    const body = (await req.json().catch(() => null)) as {
      docType?: unknown; docId?: unknown; format?: unknown;
      filename?: unknown; projectId?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
    }

    const docType = typeof body.docType === "string" && body.docType ? body.docType : null;
    const format = parseFormat(body.format);
    const filename = typeof body.filename === "string" && body.filename ? body.filename : null;

    if (!docType) {
      return NextResponse.json({ error: "Le type de document (docType) est requis." }, { status: 400 });
    }
    if (!format) {
      return NextResponse.json({ error: "Le format est requis (PDF, DOCX ou XLSX)." }, { status: 400 });
    }
    if (!filename) {
      return NextResponse.json({ error: "Le nom de fichier (filename) est requis." }, { status: 400 });
    }

    await recordExport({
      docType,
      docId: typeof body.docId === "string" && body.docId ? body.docId : null,
      format,
      filename,
      projectId: typeof body.projectId === "string" && body.projectId ? body.projectId : null,
    });
    await logTreatment({
      agent: "EXPORT",
      action: `Export ${format} ${docType}`,
      outputMeta: { filename },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Enregistrement de l'export impossible." },
      { status: 500 },
    );
  }
}
