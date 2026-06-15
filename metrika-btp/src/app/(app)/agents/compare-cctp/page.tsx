"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PdfDropzone } from "@/components/ui/pdf-dropzone";
import { getCompany } from "@/lib/client-data";
import { cn } from "@/lib/utils";
import { Loader2, Sparkles, FileText, X, GitCompare, FileDown } from "lucide-react";

interface Finding {
  chapitre?: string; type?: string; versionA: string; versionB: string;
  ecart: string; gravite: "critique" | "majeur" | "moyen" | "mineur"; action?: string;
}
interface CompareResult {
  verdict: string;
  noteSur10: number;
  scores: { similarite: number; risqueDivergence: number };
  findings: Finding[];
  syntheseChapitres?: string[];
}

const GRAVITE_CLASS: Record<string, string> = {
  critique: "bg-destructive/10 text-destructive",
  majeur: "bg-warning/15 text-warning-foreground",
  moyen: "bg-gold-100 text-gold-800",
  mineur: "bg-muted text-muted-foreground",
};
const GRAVITE_LABEL: Record<string, string> = { critique: "Critique", majeur: "Majeur", moyen: "Moyen", mineur: "Mineur" };
const TYPE_LABEL: Record<string, string> = {
  identite: "Identité", intervenant: "Intervenant", structure: "Structure", norme: "Norme",
  materiau: "Matériau", mise_en_oeuvre: "Mise en œuvre", controle: "Contrôle",
  limite_prestation: "Limite de prestation", interface: "Interface", ajout: "Ajout",
  suppression: "Suppression", reformulation: "Reformulation", autre: "Autre",
};

function ScoreCard({ label, value, unit, invert }: { label: string; value: number; unit: string; invert?: boolean }) {
  const max = unit === "/10" ? 10 : 100;
  const pct = (value / max) * 100;
  const good = invert ? pct <= 35 : pct >= 70;
  const mid = invert ? pct <= 65 : pct >= 45;
  const color = good ? "text-success" : mid ? "text-gold-600" : "text-destructive";
  const bar = good ? "bg-success" : mid ? "bg-gold-500" : "bg-destructive";
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("mt-1 font-display text-3xl font-semibold", color)}>{value}<span className="text-base text-muted-foreground">{unit}</span></p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function CompareCctpPage() {
  const [aFiles, setAFiles] = useState<File[]>([]);
  const [bFiles, setBFiles] = useState<File[]>([]);
  const [aText, setAText] = useState("");
  const [bText, setBText] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [result, setResult] = useState<CompareResult | null>(null);

  async function extractFiles(files: File[]): Promise<string> {
    if (files.length === 0) return "";
    const { extractPdfText } = await import("@/lib/pdf-render");
    let out = "";
    for (const f of files) {
      const t = await extractPdfText(f).catch(() => "");
      if (t) out += `\n\n===== ${f.name} =====\n${t}`;
    }
    return out;
  }

  async function runCompare() {
    setBusy(true);
    setResult(null);
    try {
      setPhase("Lecture des pièces…");
      const aFull = [aText, await extractFiles(aFiles)].filter((s) => s && s.trim()).join("\n\n");
      const bFull = [bText, await extractFiles(bFiles)].filter((s) => s && s.trim()).join("\n\n");
      if (!aFull.trim() || !bFull.trim()) {
        toast.error("Fournissez les DEUX versions du CCTP (PDF textuel ou texte collé).");
        setBusy(false); setPhase(""); return;
      }
      setPhase("Comparaison en cours…");
      const r = await fetch("/api/compare-cctp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cctpA: aFull, cctpB: bFull }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResult(d.result);
      toast.success(`${d.result.findings?.length ?? 0} écart(s) détecté(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally { setBusy(false); setPhase(""); }
  }

  async function exportPdf() {
    if (!result) return;
    try {
      const fresh = await getCompany(true);
      const m = await import("@/lib/export-compare-cctp");
      await m.exportCompareCctpPdf(result, fresh as never);
      toast.success("Rapport exporté.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    }
  }

  const fileList = (files: File[], setter: (f: File[]) => void) => files.length > 0 && (
    <ul className="space-y-1.5">
      {files.map((f, i) => (
        <li key={i} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-navy-800">{f.name}</span>
          <button onClick={() => setter(files.filter((_, j) => j !== i))} className="text-destructive hover:opacity-70"><X className="size-3.5" /></button>
        </li>
      ))}
    </ul>
  );

  const counts = result
    ? (["critique", "majeur", "moyen", "mineur"] as const).map((g) => result.findings.filter((f) => f.gravite === g).length)
    : [0, 0, 0, 0];

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Contrôle qualité"
        title="Comparaison"
        accent="CCTP ↔ CCTP"
        description="Comparez deux versions d'un CCTP : intervenants, structure, normes, matériaux, limites de prestations, ajouts/suppressions/reformulations. Écarts classés par gravité."
      />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit">
          <CardHeader><CardTitle className="text-navy-900">Versions à comparer</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Version A (référence)</Label>
              <PdfDropzone title="CCTP A en PDF" hint="Lu automatiquement (texte)" onFiles={(l) => setAFiles((p) => [...p, ...l])} />
              {fileList(aFiles, setAFiles)}
              <Textarea value={aText} onChange={(e) => setAText(e.target.value)} placeholder="…ou collez le texte du CCTP A" className="min-h-[80px] text-xs" />
            </div>
            <div className="space-y-2">
              <Label>Version B (à comparer)</Label>
              <PdfDropzone title="CCTP B en PDF" hint="Lu automatiquement (texte)" onFiles={(l) => setBFiles((p) => [...p, ...l])} />
              {fileList(bFiles, setBFiles)}
              <Textarea value={bText} onChange={(e) => setBText(e.target.value)} placeholder="…ou collez le texte du CCTP B" className="min-h-[80px] text-xs" />
            </div>
            <Button variant="gold" size="lg" className="w-full" disabled={busy} onClick={runCompare}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? (phase || "Comparaison…") : "Comparer les CCTP"}
            </Button>
            <p className="text-xs text-muted-foreground">Aucun arbitrage automatique : les deux versions sont citées, l'écart est classé par gravité.</p>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {!result ? (
            <Card className="flex h-full min-h-[400px] items-center justify-center border-dashed">
              <div className="text-center">
                <GitCompare className="mx-auto size-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">Le rapport de comparaison (verdict, scores, écarts) apparaîtra ici.</p>
              </div>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <ScoreCard label="Similarité" value={result.scores.similarite} unit="/100" />
                <ScoreCard label="Risque divergence" value={result.scores.risqueDivergence} unit="/100" invert />
                <ScoreCard label="Note globale" value={result.noteSur10} unit="/10" />
              </div>

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-navy-900">Verdict</CardTitle>
                  <Button variant="outline" size="sm" onClick={exportPdf}><FileDown className="size-4" /> Rapport PDF</Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-navy-800">{result.verdict}</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {(["critique", "majeur", "moyen", "mineur"] as const).map((g, i) => (
                      <span key={g} className={cn("rounded-full px-2.5 py-0.5 font-semibold", GRAVITE_CLASS[g])}>{counts[i]} {GRAVITE_LABEL[g].toLowerCase()}</span>
                    ))}
                  </div>
                  {result.syntheseChapitres && result.syntheseChapitres.length > 0 && (
                    <div className="rounded-lg border border-navy-100 bg-navy-50/40 p-3">
                      <p className="mb-1 text-xs font-semibold text-navy-800">Chapitres ajoutés / supprimés</p>
                      <ul className="list-disc space-y-0.5 pl-5 text-xs text-navy-700">
                        {result.syntheseChapitres.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-navy-900">Écarts détectés ({result.findings.length})</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  {result.findings.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Aucun écart détecté.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                          <th className="pb-2 pr-2">Chapitre / type</th>
                          <th className="pb-2 px-2">Version A</th>
                          <th className="pb-2 px-2">Version B</th>
                          <th className="pb-2 px-2">Gravité</th>
                          <th className="pb-2 pl-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.findings.map((f, i) => (
                          <tr key={i} className="border-b border-border/60 align-top">
                            <td className="py-2 pr-2 text-navy-800">{f.chapitre || "—"}{f.type ? <span className="block text-[11px] text-muted-foreground">{TYPE_LABEL[f.type] ?? f.type}</span> : null}</td>
                            <td className="px-2 py-2 text-navy-700">{f.versionA}</td>
                            <td className="px-2 py-2 text-navy-700">{f.versionB}</td>
                            <td className="px-2 py-2"><span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", GRAVITE_CLASS[f.gravite])}>{GRAVITE_LABEL[f.gravite]}</span></td>
                            <td className="pl-2 py-2 text-navy-700">{f.action || "—"}<span className="block text-[11px] text-muted-foreground">{f.ecart}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
