import { runClaude } from "@/lib/ai/client";
import { INTERVENANTS_PROMPT, INTERVENANTS_SCHEMA } from "@/lib/ai/prompts";
import { normalizeActorTable, ACTOR_ROLES, type ActorEntry, type ActorRole } from "@/lib/fidelity";

export interface PlanImage { data: string; mediaType: string }

interface RawActor {
  role?: string; value?: string; sourceFile?: string; sourcePage?: string;
  confidence?: string; status?: string;
}

/**
 * Extrait la TABLE UNIQUE des intervenants du projet (R2). Renvoie TOUJOURS les
 * 7 rôles de référence (normalizeActorTable), un rôle absent étant marqué
 * « Non renseigné dans les pièces fournies ». Les rôles ne sont jamais
 * réinterprétés ailleurs dans le document.
 */
export async function extractIntervenants(params: {
  cctpText?: string;
  planContext?: string;
  images?: PlanImage[];
}): Promise<ActorEntry[]> {
  const user = `${params.cctpText?.trim() ? `CCTP / pièces écrites :\n"""\n${params.cctpText.slice(0, 60000)}\n"""\n` : ""}
${params.planContext?.trim() ? `Synthèse des plans (cartouches) :\n"""\n${params.planContext.slice(0, 12000)}\n"""\n` : ""}
${params.images?.length ? "Des cartouches de plans sont fournis en images : lis-les." : ""}

Extrais la table unique des intervenants (7 rôles). N'invente rien ; un rôle absent = « Non renseigné dans les pièces fournies ».`;

  const res = await runClaude<{ actors: RawActor[] }>({
    system: INTERVENANTS_PROMPT,
    user,
    images: params.images,
    schema: INTERVENANTS_SCHEMA,
    maxTokens: 2000,
  });

  return normalizeActorTable(
    (res.actors ?? []).map((a) => ({
      role: a.role as ActorRole,
      value: a.value,
      source_file: a.sourceFile,
      source_page: a.sourcePage,
      confidence: a.confidence as ActorEntry["confidence"],
      status: a.status as ActorEntry["status"],
    })),
  );
}

/** Met la table des intervenants en texte injectable dans le prompt CCTP. */
export function formatIntervenantsForPrompt(table: ActorEntry[]): string {
  const rows = table.map((a) => {
    const src = [a.source_file, a.source_page ? `p.${a.source_page}` : ""].filter(Boolean).join(" ");
    return `- ${ACTOR_ROLES[a.role].label} : ${a.value}${src ? ` (source : ${src})` : ""} [${a.status}]`;
  });
  return `TABLE DES INTERVENANTS (à reprendre EXACTEMENT, sans réinterprétation) :\n${rows.join("\n")}`;
}
