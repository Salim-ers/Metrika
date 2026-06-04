import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { translateDocument, type Direction } from "@/services/translation.service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { pages, direction } = await req.json();
  if (!Array.isArray(pages) || pages.length === 0) {
    return NextResponse.json({ error: "Aucun texte à traduire. Le PDF est peut-être scanné (image)." }, { status: 400 });
  }
  const totalChars = pages.reduce((n: number, p: string) => n + (typeof p === "string" ? p.length : 0), 0);
  if (totalChars === 0) {
    return NextResponse.json(
      { error: "PDF sans texte sélectionnable (probablement scanné). Utilisez un PDF textuel." },
      { status: 400 },
    );
  }
  if (totalChars > 400_000) {
    return NextResponse.json({ error: "Document trop volumineux à traduire en une fois. Scindez-le." }, { status: 400 });
  }

  try {
    const dir: Direction = ["fr-en", "en-fr"].includes(direction) ? direction : "auto";
    const result = await translateDocument(pages as string[], dir);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur de traduction" },
      { status: 500 },
    );
  }
}
