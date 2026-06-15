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
import { Loader2, Sparkles, FileText, X, ShieldCheck, FileDown, AlertTriangle } from "lucide-react";

interface Finding {
  refSource?: string; elementSource: string; elementGenere: string;
  ecart: string; gravite: "critique" | "majeur" | "moyen" | "mineur";
  action: string; sourcePage?: string; statut?: string;
}
interface Hypothese {
  hypothese: string; raison?: string; sourcePartielle?: string; impact: string; validation?: string;
}
interface AuditResult {
  verdict: string;
  noteSur10: number;
  scores: { fidelite: number; exploitabilite: number; tracabilite: number; risqueMarche: number };
  findings: Finding[];
  correctionsPrioritaires?: string[];
  hypotheses?: Hypothese[];
  piecesManquantes?: string[];
}

const GRAVITE_CLASS: Record<string, string> = {
  critique: "bg-destructive/10 text-destructive",
  majeur: "bg-warning/15 text-warning-foreground",
  moyen: "bg-gold-100 text-gold-800",
  mineur: "bg-muted text-muted-foreground",
};
const GRAVITE_LABEL: Record<string, string> = { critique: "Critique", majeur: "Majeur", moyen: "Moyen", mineur: "Mineur" };

function ScoreCard({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  // invert = true pour le risque (haut = mauvais).
  const good = invert ? value <= 35 : value >= 70;
  const mid = invert ? value <= 65 : value >= 45;
  const color = good ? "text-success" : mid ? "text-gold-600" : "text-destructive";
  const bar = good ? "bg-success" : mid ? "bg-gold-500" : "bg-destructive";
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("mt-1 font-display text-3xl font-semibold", color)}>{value}<span className="text-base text-muted-foreground">/100</span></p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", bar)} style={{ width: `${value}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AuditPage() {
  const [cctpFiles, setCctpFiles] = useState<File[]>([]);
  const [dpgfFiles, setDpgfFiles] = useState<File[]>([]);
  const [cctpText, setCctpText] = useState("");
  const [dpgfText, setDpgfText] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);

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

  async function runAudit() {
    setBusy(true);
    setResult(null);
    try {
      setPhase("Lecture des pièces…");
      const cctpFull = [cctpText, await extractFiles(cctpFiles)].filter((s) => s && s.trim()).join("\n\n");
      const dpgfFull = [dpgfText, await extractFiles(dpgfFiles)].filter((s) => s && s.trim()).join("\n\n");
      if (!cctpFull.trim() || !dpgfFull.trim()) {
        toast.error("Fournissez le CCTP ET le DPGF (PDF textuel ou texte collé).");
        setBusy(false); setPhase(""); return;
      }
      setPhase("Audit en cours…");
      const r = await fetch("/api/audit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cctpText: cctpFull, dpgfText: dpgfFull }),
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
      const m = await import("@/lib/export-audit");
      await m.exportAuditPdf(result, fresh as never);
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
        title="Audit"
        accent="CCTP ↔ DPGF"
        description="Vérifiez qu'un DPGF est fidèle au CCTP : postes ajoutés/absents, unités, quantités sourcées. Écarts classés par gravité, avec verdict et scores."
      />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit">
          <CardHeader><CardTitle className="text-navy-900">Pièces à comparer</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>CCTP (référence)</Label>
              <PdfDropzone title="CCTP en PDF" hint="Lu automatiquement (texte)" onFiles={(l) => setCctpFiles((p) => [...p, ...l])} />
              {fileList(cctpFiles, setCctpFiles)}
              <Textarea value={cctpText} onChange={(e) => setCctpText(e.target.value)} placeholder="…ou collez le texte du CCTP" className="min-h-[80px] text-xs" />
            </div>
            <div className="space-y-2">
              <Label>DPGF / CDPGF (à auditer)</Label>
              <PdfDropzone title="DPGF en PDF" hint="Lu automatiquement (texte)" onFiles={(l) => setDpgfFiles((p) => [...p, ...l])} />
              {fileList(dpgfFiles, setDpgfFiles)}
              <Textarea value={dpgfText} onChange={(e) => setDpgfText(e.target.value)} placeholder="…ou collez le texte du DPGF" className="min-h-[80px] text-xs" />
            </div>
            <Button variant="gold" size="lg" className="w-full" disabled={busy} onClick={runAudit}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? (phase || "Audit…") : "Lancer l'audit"}
            </Button>
            <p className="text-xs text-muted-foreground">Fiabilité &gt; complétude : aucune conclusion « conforme » sans preuve sourcée.</p>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {!result ? (
            <Card className="flex h-full min-h-[400px] items-center justify-center border-dashed">
              <div className="text-center">
                <ShieldCheck className="mx-auto size-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">Le rapport d'audit (verdict, scores, écarts) apparaîtra ici.</p>
              </div>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <ScoreCard label="Fidélité" value={result.scores.fidelite} />
                <ScoreCard label="Exploitabilité" value={result.scores.exploitabilite} />
                <ScoreCard label="Traçabilité" value={result.scores.tracabilite} />
                <ScoreCard label="Risque marché" value={result.scores.risqueMarche} invert />
              </div>

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-navy-900">Verdict</CardTitle>
                    <span className="rounded-full bg-navy-700 px-2.5 py-0.5 text-xs font-semibold text-white">{result.noteSur10}/10</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={exportPdf}><FileDown className="size-4" /> Rapport PDF</Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-navy-800">{result.verdict}</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {(["critique", "majeur", "moyen", "mineur"] as const).map((g, i) => (
                      <span key={g} className={cn("rounded-full px-2.5 py-0.5 font-semibold", GRAVITE_CLASS[g])}>{counts[i]} {GRAVITE_LABEL[g].toLowerCase()}</span>
                    ))}
                  </div>
                  {result.correctionsPrioritaires && result.correctionsPrioritaires.length > 0 && (
                    <div className="rounded-lg border border-gold-200 bg-gold-50/40 p-3">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-navy-800"><AlertTriangle className="size-3.5 text-gold-600" /> Corrections prioritaires</p>
                      <ul className="list-disc space-y-0.5 pl-5 text-xs text-navy-700">
                        {result.correctionsPrioritaires.map((c, i) => <li key={i}>{c}</li>)}
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
                          <th className="pb-2 pr-2">Élément CCTP</th>
                          <th className="pb-2 px-2">Élément DPGF</th>
                          <th className="pb-2 px-2">Écart</th>
                          <th className="pb-2 px-2">Gravité</th>
                          <th className="pb-2 px-2">Action corrective</th>
                          <th className="pb-2 pl-2">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.findings.map((f, i) => (
                          <tr key={i} className="border-b border-border/60 align-top">
                            <td className="py-2 pr-2 text-navy-800">{f.elementSource}{f.refSource ? <span className="block text-[11px] text-muted-foreground">{f.refSource}</span> : null}</td>
                            <td className="px-2 py-2 text-navy-700">{f.elementGenere}</td>
                            <td className="px-2 py-2 text-muted-foreground">{f.ecart}</td>
                            <td className="px-2 py-2"><span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", GRAVITE_CLASS[f.gravite])}>{GRAVITE_LABEL[f.gravite]}</span></td>
                            <td className="px-2 py-2 text-navy-700">{f.action}</td>
                            <td className="pl-2 py-2 text-[11px] text-muted-foreground">{f.sourcePage || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>

              {result.hypotheses && result.hypotheses.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-navy-900">Registre des hypothèses ({result.hypotheses.length})</CardTitle></CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                          <th className="pb-2 pr-2">Hypothèse</th>
                          <th className="pb-2 px-2">Raison</th>
                          <th className="pb-2 px-2">Impact possible</th>
                          <th className="pb-2 pl-2">Validation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.hypotheses.map((h, i) => (
                          <tr key={i} className="border-b border-border/60 align-top">
                            <td className="py-2 pr-2 text-navy-800">{h.hypothese}{h.sourcePartielle ? <span className="block text-[11px] text-muted-foreground">Source : {h.sourcePartielle}</span> : null}</td>
                            <td className="px-2 py-2 text-navy-700">{h.raison || "—"}</td>
                            <td className="px-2 py-2 text-muted-foreground">{h.impact}</td>
                            <td className="pl-2 py-2 text-navy-700">{h.validation || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

              {result.piecesManquantes && result.piecesManquantes.length > 0 && (
                <Card className="border-warning/40 bg-warning/5">
                  <CardHeader><CardTitle className="text-navy-900">Pièces manquantes pour fiabiliser</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-navy-700">
                      {result.piecesManquantes.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
