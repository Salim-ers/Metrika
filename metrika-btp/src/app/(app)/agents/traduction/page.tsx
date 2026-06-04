"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PdfDropzone } from "@/components/ui/pdf-dropzone";
import { getCompany } from "@/lib/client-data";
import { Loader2, Languages, FileDown, Sparkles, FileText, X, ArrowRight } from "lucide-react";

type Direction = "auto" | "fr-en" | "en-fr";
interface Result { sourceLang: string; targetLang: string; pages: string[] }

const LANG_FR: Record<string, string> = { fr: "Français", en: "Anglais" };

export default function TraductionPage() {
  const [file, setFile] = useState<File | null>(null);
  const [direction, setDirection] = useState<Direction>("auto");
  const [pagesOrig, setPagesOrig] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);

  useEffect(() => { getCompany().then(setCompany); }, []);

  async function translate() {
    if (!file) { toast.error("Ajoutez un PDF à traduire."); return; }
    setBusy(true);
    setResult(null);
    try {
      setPhase("Lecture du PDF…");
      const { extractPdfPages } = await import("@/lib/pdf-render");
      const pages = await extractPdfPages(file);
      const totalChars = pages.reduce((n, p) => n + p.length, 0);
      if (totalChars === 0) {
        toast.error("Aucun texte sélectionnable (PDF probablement scanné). Utilisez un PDF textuel.");
        setBusy(false); setPhase(""); return;
      }
      setPagesOrig(pages);

      setPhase("Traduction en cours…");
      const res = await fetch("/api/traduction", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages, direction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      toast.success(`Traduction terminée (${LANG_FR[data.sourceLang]} → ${LANG_FR[data.targetLang]}).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false); setPhase("");
    }
  }

  async function exportTr(kind: "pdf" | "docx") {
    if (!result) return;
    try {
      const fresh = await getCompany(true);
      setCompany(fresh);
      const m = await import("@/lib/export-translation");
      const meta = { fileName: file?.name, sourceLang: result.sourceLang, targetLang: result.targetLang };
      if (kind === "pdf") await m.exportTranslationPdf(result.pages, fresh as never, meta);
      else await m.exportTranslationDocx(result.pages, meta);
      toast.success("Export généré.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Documents"
        title="Traduction"
        accent="PDF fidèle"
        description="Importez un PDF textuel, traduisez-le FR ↔ EN en conservant la structure, vérifiez l’aperçu côte à côte, puis exportez."
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
                onFiles={(list) => { setFile(list[0] ?? null); setResult(null); }}
              />
              {file && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-navy-800">{file.name}</span>
                  <button onClick={() => { setFile(null); setResult(null); }} className="text-destructive hover:opacity-70"><X className="size-3.5" /></button>
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
                <option value="auto">Détection automatique (bascule vers l’autre langue)</option>
                <option value="fr-en">Français → Anglais</option>
                <option value="en-fr">Anglais → Français</option>
              </select>
            </div>

            <Button variant="gold" size="lg" className="w-full" disabled={busy || !file} onClick={translate}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? (phase || "Traduction…") : "Traduire"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Les nombres, unités, références et noms propres sont préservés. La mise en page est respectée au mieux.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!result ? (
            <Card className="flex h-full min-h-[400px] items-center justify-center border-dashed">
              <div className="text-center">
                <Languages className="mx-auto size-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">La traduction apparaîtra ici, page par page.</p>
              </div>
            </Card>
          ) : (
            <>
              <Card className="border-gold-200 bg-gold-50/40">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="flex items-center gap-2 text-sm text-navy-800">
                    <Badge variant="muted">{LANG_FR[result.sourceLang]}</Badge>
                    <ArrowRight className="size-4 text-gold-600" />
                    <Badge variant="gold">{LANG_FR[result.targetLang]}</Badge>
                    <span className="text-muted-foreground">· {result.pages.length} page(s)</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => exportTr("docx")}><FileDown className="size-4" /> DOCX</Button>
                    <Button variant="gold" onClick={() => exportTr("pdf")}><FileDown className="size-4" /> PDF</Button>
                  </div>
                </CardContent>
              </Card>

              {result.pages.map((tr, i) => (
                <Card key={i}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Page {i + 1}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gold-600">{LANG_FR[result.sourceLang]} (original)</p>
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/20 p-3 font-sans text-xs leading-relaxed text-muted-foreground">{pagesOrig[i] ?? ""}</pre>
                    </div>
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gold-600">{LANG_FR[result.targetLang]} (traduction)</p>
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-card p-3 font-sans text-xs leading-relaxed text-navy-800">{tr}</pre>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
