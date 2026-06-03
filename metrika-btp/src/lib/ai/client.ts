import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export const anthropic = new Anthropic({ apiKey });

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
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY manquante. Renseignez-la dans .env pour activer les agents IA."
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
}
