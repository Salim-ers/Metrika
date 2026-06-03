import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export const anthropic = new Anthropic({ apiKey });

interface RunOptions {
  system: string;
  user: string;
  maxTokens?: number;
  /** Si vrai, on tente de parser la réponse comme JSON. */
  json?: boolean;
}

/**
 * Appel unique à Claude. Centralise le modèle, la gestion d'erreur
 * et le parsing JSON pour tous les agents.
 */
export async function runClaude<T = string>({
  system,
  user,
  maxTokens = 8000,
  json = false,
}: RunOptions): Promise<T> {
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY manquante. Renseignez-la dans .env pour activer les agents IA."
    );
  }

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!json) return text as T;

  // Nettoyage des éventuelles balises ```json
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error("Réponse IA non parsable en JSON : " + cleaned.slice(0, 200));
  }
}
