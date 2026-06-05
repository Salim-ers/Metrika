"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PdfDropzone } from "@/components/ui/pdf-dropzone";
import { Loader2, Languages, FileDown, Sparkles, FileText, X } from "lucide-react";

type Direction = "auto" | "fr-en" | "en-fr" | "fr-ar" | "ar-fr";
const LANG_FR: Record<string, string> = { fr: "Français", en: "Anglais", ar: "Arabe" };

export default function TraductionPage() {
  const [file, setFile] = useState<File | null>(null);
  const [direction, setDirection] = useState<Direction>("fr-ar");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [info, setInfo] = useState<{ source: string; target: string; pages: number } | null>(null);

  function resetResult() {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null); setBytes(null); setInfo(null);
  }

  async function translate() {
    if (!file) { toast.error("Ajoutez un PDF à traduire."); return; }
    setBusy(true);
    resetResult();
    try {
      setPhase("Lecture du PDF…");
      const { extractPdfLayout } = await import("@/lib/pdf-render");
      const pages = await extractPdfLayout(file);
      const totalLines = pages.reduce((n, p) => n + p.lines.length, 0);
      if (totalLines === 0) {
        toast.error("Aucun texte sélectionnable (PDF scanné ?). Utilisez un PDF textuel.");
        setBusy(false); setPhase(""); return;
      }

      const post = (payload: object) =>
        fetch("/api/traduction", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
          .then(async (r) => ({ ok: r.ok, d: await r.json() }));

      // Détermination de la cible (et de la source).
      let sourceLang = "fr", targetLang = "fr";
      if (direction === "fr-en") { sourceLang = "fr"; targetLang = "en"; }
      else if (direction === "en-fr") { sourceLang = "en"; targetLang = "fr"; }
      else if (direction === "fr-ar") { sourceLang = "fr"; targetLang = "ar"; }
      else if (direction === "ar-fr") { sourceLang = "ar"; targetLang = "fr"; }
      else {
        setPhase("Détection de la langue…");
        const sample = pages.flatMap((p) => p.lines.map((l) => l.text)).filter(Boolean).slice(0, 25).join("\n");
        const a = await post({ detect: true, sample });
        sourceLang = a.ok ? (a.d.lang ?? "fr") : "fr";
        targetLang = sourceLang === "ar" ? "fr" : sourceLang === "fr" ? "en" : "fr";
      }

      // Traduction page par page (1 requête courte / page).
      const translations: string[][] = [];
      for (let p = 0; p < pages.length; p++) {
        setPhase(`Traduction page ${p + 1}/${pages.length}…`);
        const lines = pages[p].lines.map((l) => l.text);
        const r = await post({ lines, target: targetLang });
        translations.push(r.ok && Array.isArray(r.d.translations) ? r.d.translations : lines);
      }

      setPhase("Reconstruction du PDF…");
      const { buildTranslatedPdf } = await import("@/lib/export-translation");
      const out = await buildTranslatedPdf(pages, translations, targetLang as "fr" | "en" | "ar");
      setBytes(out);
      const url = URL.createObjectURL(new Blob([out as BlobPart], { type: "application/pdf" }));
      setPdfUrl(url);
      setInfo({ source: sourceLang, target: targetLang, pages: pages.length });
      toast.success(`Traduit (${LANG_FR[sourceLang]} → ${LANG_FR[targetLang]}).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false); setPhase("");
    }
  }

  function download() {
    if (!bytes) return;
    const name = `traduction-${(file?.name ?? "document").replace(/\.pdf$/i, "")}.pdf`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    a.download = name; a.click();
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Documents"
        title="Traduction"
        accent="PDF fidèle"
        description="Importez un PDF textuel : la traduction reprend la mise en page d'origine (positions, colonnes), en français, anglais ou arabe."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit">
          <CardHeader><CardTitle className="text-navy-900">Document à traduire</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>PDF source</Label>
              <PdfDropzone
                title="Glissez un PDF ici ou cliquez"
                hint="PDF textuel (les PDF scannés ne contiennent pas de texte)"
                onFiles={(list) => { setFile(list[0] ?? null); resetResult(); }}
              />
              {file && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-navy-800">{file.name}</span>
                  <button onClick={() => { setFile(null); resetResult(); }} className="text-destructive hover:opacity-70"><X className="size-3.5" /></button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Sens de traduction</Label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as Direction)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="fr-ar">Français → Arabe</option>
                <option value="ar-fr">Arabe → Français</option>
                <option value="fr-en">Français → Anglais</option>
                <option value="en-fr">Anglais → Français</option>
                <option value="auto">Détection automatique</option>
              </select>
            </div>

            <Button variant="gold" size="lg" className="w-full" disabled={busy || !file} onClick={translate}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? (phase || "Traduction…") : "Traduire"}
            </Button>

            {info && (
              <div className="flex items-center justify-between rounded-lg border border-gold-200 bg-gold-50/40 px-3 py-2 text-xs">
                <span className="flex items-center gap-1.5 text-navy-800">
                  <Badge variant="muted">{LANG_FR[info.source]}</Badge> → <Badge variant="gold">{LANG_FR[info.target]}</Badge>
                  <span className="text-muted-foreground">· {info.pages} page(s)</span>
                </span>
                <Button variant="outline" size="sm" onClick={download}><FileDown className="size-4" /> PDF</Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              La mise en page (positions, colonnes) est reproduite. Nombres, unités et références sont conservés.
            </p>
          </CardContent>
        </Card>

        <div className="min-h-[600px]">
          {pdfUrl ? (
            <object data={pdfUrl} type="application/pdf" className="h-[80vh] w-full rounded-xl border border-border shadow-card">
              <div className="p-6 text-sm text-muted-foreground">
                Aperçu indisponible dans ce navigateur. <button onClick={download} className="text-gold-600 underline">Télécharger le PDF</button>.
              </div>
            </object>
          ) : (
            <Card className="flex h-full min-h-[600px] items-center justify-center border-dashed">
              <div className="text-center">
                <Languages className="mx-auto size-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">La traduction (mise en page fidèle) apparaîtra ici.</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
