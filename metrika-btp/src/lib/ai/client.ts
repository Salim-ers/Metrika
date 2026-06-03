import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export const anthropic = new Anthropic({ apiKey });

/** La clé est-elle réellement renseignée (pas vide, pas le placeholder du .env) ? */
function hasUsableKey(): boolean {
  return !!apiKey && apiKey.startsWith("sk-ant-") && !apiKey.includes("...");
}

/** Traduit les erreurs SDK Anthropic en messages clairs et actionnables (FR). */
function translateAiError(err: unknown): Error {
  const status = (err as { status?: number })?.status;
  const raw = err instanceof Error ? err.message : String(err);
  if (status === 401 || /authentication_error|invalid x-api-key/i.test(raw)) {
    return new Error(
      "Clé API Claude invalide. Vérifiez ANTHROPIC_API_KEY dans le fichier .env (elle doit commencer par sk-ant-) puis redémarrez le serveur."
    );
  }
  if (status === 429 || /rate_limit/i.test(raw)) {
    return new Error("Limite de requêtes Claude atteinte. Réessayez dans quelques instants.");
  }
  if (status === 400 && /credit balance|billing/i.test(raw)) {
    return new Error("Crédit Anthropic insuffisant. Ajoutez du crédit sur votre compte console.anthropic.com.");
  }
  return err instanceof Error ? err : new Error(raw);
}

interface RunOptions {
  system: string;
  user: string;
  /** Images jointes (ex: plans rastérisés) analysées visuellement par Claude. */
  images?: { data: string; mediaType: string }[];
  maxTokens?: number;
  /** Si vrai, on tente de parser la réponse comme JSON (texte libre). */
  json?: boolean;
  /**
   * Schéma JSON de sortie. S'il est fourni, on force une sortie STRUCTURÉE
   * via tool-use : Claude renvoie un objet JSON valide garanti (évite les
   * échecs de parsing dus aux retours à la ligne dans les chaînes).
   */
  schema?: Record<string, unknown>;
}

/**
 * Appel unique à Claude. Centralise le modèle, la gestion d'erreur
 * et le parsing JSON pour tous les agents.
 */
export async function runClaude<T = string>({
  system,
  user,
  images,
  maxTokens = 8000,
  json = false,
  schema,
}: RunOptions): Promise<T> {
  if (!hasUsableKey()) {
    throw new Error(
      "Clé API Claude absente. Ouvrez le fichier .env, remplacez sk-ant-... par votre vraie clé Anthropic, puis redémarrez le serveur (npm run dev)."
    );
  }

  const content: Anthropic.MessageParam["content"] =
    images && images.length
      ? [
          ...images.map(
            (im): Anthropic.ImageBlockParam => ({
              type: "image",
              source: {
                type: "base64",
                media_type: im.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                data: im.data,
              },
            })
          ),
          { type: "text", text: user },
        ]
      : user;

  try {
    // ── Sortie structurée garantie (tool-use) ──
    if (schema) {
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content }],
        tools: [
          {
            name: "resultat",
            description: "Renvoie le résultat au format structuré demandé.",
            input_schema: schema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: "resultat" },
      });
      const tool = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (!tool) throw new Error("L'IA n'a pas renvoyé de sortie structurée.");
      return tool.input as T;
    }

    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!json) return text as T;

    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new Error("Réponse IA non parsable en JSON : " + cleaned.slice(0, 200));
    }
  } catch (err) {
    throw translateAiError(err);
  }
}
