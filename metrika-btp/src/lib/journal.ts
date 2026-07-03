import { prisma } from "@/lib/prisma";

/**
 * Journalisation transverse (serveur uniquement) :
 *  - Treatment        : trace de chaque opération d'agent (génération, export…)
 *  - DocumentVersion  : snapshot JSON à chaque étape clé (génération, save, export, lock)
 *  - ValidationIssue  : registre des points de contrôle qualité par document
 *
 * Tous les appels sont FAIL-SAFE : une erreur de journalisation ne doit
 * jamais faire échouer l'opération métier qu'elle trace.
 */

export async function logTreatment(params: {
  agent: string;
  action: string;
  status?: "DONE" | "FAILED" | "RUNNING" | "AWAITING_VALIDATION";
  inputMeta?: unknown;
  outputMeta?: unknown;
  error?: string;
}): Promise<string | null> {
  try {
    const t = await prisma.treatment.create({
      data: {
        agent: params.agent,
        action: params.action,
        status: params.status ?? "DONE",
        inputMeta: params.inputMeta !== undefined ? JSON.stringify(params.inputMeta).slice(0, 20000) : null,
        outputMeta: params.outputMeta !== undefined ? JSON.stringify(params.outputMeta).slice(0, 20000) : null,
        error: params.error?.slice(0, 2000),
        finishedAt: params.status === "RUNNING" ? null : new Date(),
      },
    });
    return t.id;
  } catch (e) {
    console.warn("[journal] treatment:", (e as Error).message?.slice(0, 120));
    return null;
  }
}

export async function snapshotVersion(params: {
  docType: "CCTP" | "DPGF" | "SOUS_DETAIL";
  docId: string;
  version: number;
  indice?: string | null;
  trigger: "generation" | "save" | "export" | "lock";
  payload: unknown;
}): Promise<void> {
  try {
    await prisma.documentVersion.create({
      data: {
        docType: params.docType,
        docId: params.docId,
        version: params.version,
        indice: params.indice ?? null,
        trigger: params.trigger,
        payload: JSON.stringify(params.payload),
      },
    });
  } catch (e) {
    console.warn("[journal] version:", (e as Error).message?.slice(0, 120));
  }
}

export interface IssueInput {
  severity: "bloquant" | "majeur" | "mineur" | "info";
  kind: "missing_data" | "hypothesis" | "inconsistency" | "unsourced" | "to_validate" | "override";
  message: string;
  context?: unknown;
}

/**
 * Remplace le registre de points non résolus d'un document par la liste
 * fournie (les points résolus sont conservés pour l'historique).
 */
export async function recordIssues(params: {
  projectId?: string | null;
  docType: string;
  docId?: string | null;
  issues: IssueInput[];
}): Promise<void> {
  try {
    await prisma.validationIssue.deleteMany({
      where: { docType: params.docType, docId: params.docId ?? null, resolved: false },
    });
    if (params.issues.length === 0) return;
    await prisma.validationIssue.createMany({
      data: params.issues.slice(0, 500).map((i) => ({
        projectId: params.projectId ?? null,
        docType: params.docType,
        docId: params.docId ?? null,
        severity: i.severity,
        kind: i.kind,
        message: i.message.slice(0, 2000),
        context: i.context !== undefined ? JSON.stringify(i.context).slice(0, 8000) : null,
      })),
    });
  } catch (e) {
    console.warn("[journal] issues:", (e as Error).message?.slice(0, 120));
  }
}

/** Enregistre un export dans l'historique (fail-safe). */
export async function recordExport(params: {
  docType: string;
  docId?: string | null;
  format: "PDF" | "DOCX" | "XLSX";
  filename: string;
  projectId?: string | null;
}): Promise<void> {
  try {
    await prisma.exportJob.create({
      data: {
        docType: params.docType,
        docId: params.docId ?? null,
        format: params.format,
        filename: params.filename,
        projectId: params.projectId ?? null,
      },
    });
  } catch (e) {
    console.warn("[journal] export:", (e as Error).message?.slice(0, 120));
  }
}
