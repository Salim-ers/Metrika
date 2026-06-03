import { NextRequest, NextResponse } from "next/server";

// Route de diagnostic TEMPORAIRE (protégée par clé). À supprimer après usage.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("k") !== "metrika-diag-9f3a") {
    return new NextResponse("not found", { status: 404 });
  }
  const key = process.env.ANTHROPIC_API_KEY ?? "";
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const info = { hasKey: !!key, keyPrefix: key.slice(0, 7), keyLen: key.length, model };
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const a = new Anthropic({ apiKey: key });
    const r = await a.messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: "user", content: "Réponds juste: OK" }],
    });
    const text = r.content.find((b) => b.type === "text");
    return NextResponse.json({ ...info, ok: true, reply: text && "text" in text ? text.text : null });
  } catch (e) {
    const err = e as { message?: string; status?: number; name?: string };
    return NextResponse.json({ ...info, ok: false, error: err?.message, status: err?.status, name: err?.name });
  }
}
