import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { detectLanguage, translateLines, type Lang } from "@/services/translation.service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Une requête = une unité courte (sous la limite serverless) :
 *  - { detect: true, sample }         -> { lang }
 *  - { lines: string[], target }      -> { translations: string[] }
 * L'orchestration (extraction des positions, boucle sur les pages, reconstruction
 * du PDF fidèle) est faite côté client.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await req.json();

  try {
    if (body.detect) {
      const lang = await detectLanguage(String(body.sample ?? ""));
      return NextResponse.json({ lang });
    }

    if (Array.isArray(body.lines)) {
      const lines: string[] = body.lines.map((l: unknown) => (typeof l === "string" ? l : ""));
      const totalChars = lines.reduce((n, l) => n + l.length, 0);
      if (totalChars > 200_000) {
        return NextResponse.json({ error: "Page trop volumineuse à traduire." }, { status: 413 });
      }
      const target = (["fr", "en", "ar"].includes(body.target) ? body.target : "fr") as Lang;
      const translations = await translateLines(lines, target);
      return NextResponse.json({ translations });
    }

    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur de traduction" },
      { status: 500 },
    );
  }
}
