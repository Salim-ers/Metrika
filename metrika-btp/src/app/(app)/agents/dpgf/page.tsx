"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/utils";
import { UNITS, LOTS_BTP } from "@/lib/constants";
import { useCurrency } from "@/lib/use-currency";
import { PdfDropzone } from "@/components/ui/pdf-dropzone";
import { getCompany } from "@/lib/client-data";
import { Loader2, Table2, CheckCircle2, FileDown, Sparkles, FileText, X, Plus, Trash2 } from "lucide-react";

interface Line {
  lot: string; code?: string; designation: string; description?: string;
  unit: string; quantity: number; unitPrice: number; quantitySource?: string; validated: boolean;
}

const emptyLine = (): Line => ({
  lot: LOTS_BTP[1] ?? "Gros Œuvre", designation: "", description: "",
  unit: "U", quantity: 1, unitPrice: 0, validated: false,
});

export default function DpgfPage() {
  const { currency } = useCurrency();
  const money = (n: number) => formatMoney(n, currency);

  const [cctpText, setCctpText] = useState("");
  const [planNotes, setPlanNotes] = useState("");
  const [cctpFiles, setCctpFiles] = useState<File[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);

  useEffect(() => { getCompany().then(setCompany); }, []);

  async function convert() {
    if (!cctpText.trim() && cctpFiles.length === 0) {
      toast.error("Ajoutez le CCTP : un PDF ou du texte collé.");
      return;
    }
    setBusy(true);
    try {
      // Rastérisation budgétée : on dégrade automatiquement plutôt que d'échouer.
      const cctpImages: { data: string; mediaType: string }[] = [];
      if (cctpFiles.length > 0) {
        setPhase("Lecture du CCTP…");
        const { rasterizePdfBudgeted } = await import("@/lib/pdf-render");
        // Budget réparti entre les fichiers pour rester sous la limite API (~4,5 Mo).
        const perFile = Math.floor(3_600_000 / cctpFiles.length);
        let skipped = 0;
        for (const f of cctpFiles) {
          const r = await rasterizePdfBudgeted(f, { budgetChars: perFile });
          cctpImages.push(...r.images);
          skipped += r.pagesSkipped;
        }
        if (cctpImages.length === 0) {
          toast.error("CCTP illisible ou vide. Collez le texte du CCTP à la place.");
          setBusy(false); setPhase(""); return;
        }
        if (skipped > 0) {
          toast.warning(`${skipped} page(s) ignorée(s) (CCTP volumineux). Complétez au besoin en collant le texte.`);
        }
      }

      setPhase("Analyse…");
      const res = await fetch("/api/dpgf/convert", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cctpText, planNotes, cctpImages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLines(data.lines.map((l: Line) => ({ ...l, unitPrice: 0, validated: false })));
      toast.success(`${data.lines.length} ouvrage(s) extraits. Vérifiez les quantités proposées.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally { setBusy(false); setPhase(""); }
  }

  function update(i: number, patch: Partial<Line>) {
    setLines((arr) => arr.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function addManualLine() {
    setLines((arr) => [...arr, emptyLine()]);
  }
  function removeLine(i: number) {
    setLines((arr) => arr.filter((_, j) => j !== i));
  }

  async function exportDpgf(kind: "excel" | "docx" | "pdf") {
    try {
      const fresh = await getCompany(true); // logo/cachet toujours à jour
      setCompany(fresh);
      const payload = { ...(fresh as object), currency } as never;
      const m = await import("@/lib/export-dpgf");
      if (kind === "excel") await m.exportDpgfExcel(lines, payload);
      else if (kind === "docx") await m.exportDpgfDocx(lines, payload);
      else await m.exportDpgfPdf(lines, payload);
      toast.success("Export généré.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    }
  }

  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const allValidated = lines.length > 0 && lines.every((l) => l.validated);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Décomposition de prix"
        title="DPGF"
        accent="CCTP → DPGF"
        description="Extraction automatique depuis le CCTP, ou saisie manuelle ligne par ligne. Chaque ligne est validée par vous avant export."
      />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit">
          <CardHeader><CardTitle className="text-navy-900">Source du CCTP</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>CCTP en PDF</Label>
              <PdfDropzone
                title="Glissez le(s) CCTP en PDF ici ou cliquez"
                hint="Lu automatiquement (texte + tableaux)"
                onFiles={(list) => setCctpFiles((p) => [...p, ...list])}
              />
              {cctpFiles.length > 0 && (
                <ul className="space-y-1.5">
                  {cctpFiles.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-navy-800">{f.name}</span>
                      <button onClick={() => setCctpFiles((p) => p.filter((_, j) => j !== i))} className="text-destructive hover:opacity-70"><X className="size-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-2">
              <Label>…ou coller le texte du CCTP (optionnel)</Label>
              <Textarea value={cctpText} onChange={(e) => setCctpText(e.target.value)} className="min-h-[140px]" placeholder="Collez ici le contenu du CCTP si vous n’avez pas de PDF…" />
            </div>
            <div className="space-y-2">
              <Label>Dimensions / plans (optionnel)</Label>
              <Textarea value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} placeholder="Surfaces, longueurs, volumes connus…" />
            </div>
            <Button variant="gold" size="lg" className="w-full" disabled={busy} onClick={convert}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? (phase || "Analyse…") : "Convertir en DPGF"}
            </Button>
            <Button variant="outline" className="w-full" onClick={addManualLine}>
              <Plus className="size-4" /> Ajouter une ligne manuelle
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {lines.length === 0 ? (
            <Card className="flex h-full min-h-[400px] items-center justify-center border-dashed">
              <div className="text-center">
                <Table2 className="mx-auto size-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">Le tableau DPGF apparaîtra ici.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={addManualLine}>
                  <Plus className="size-4" /> Saisir manuellement
                </Button>
              </div>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-navy-900">Décomposition ({lines.length} lignes)</CardTitle>
                <Badge variant={allValidated ? "success" : "warning"}>
                  {lines.filter((l) => l.validated).length}/{lines.length} validées
                </Badge>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="pb-2 pr-2 w-8">N°</th>
                      <th className="pb-2 pr-2">Désignation</th>
                      <th className="pb-2 px-2">U.</th>
                      <th className="pb-2 px-2 text-right">Qté</th>
                      <th className="pb-2 px-2 text-right">P.U. ({currency === "EUR" ? "€" : "MAD"})</th>
                      <th className="pb-2 px-2 text-right">Montant HT</th>
                      <th className="pb-2 pl-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i} className="border-b border-border/60 align-top">
                        <td className="py-2 pr-2 text-xs text-muted-foreground">{i + 1}</td>
                        <td className="py-2 pr-2">
                          <input
                            value={l.designation}
                            onChange={(e) => update(i, { designation: e.target.value, validated: false })}
                            placeholder="Désignation de l’ouvrage"
                            className="w-full rounded border border-input bg-card px-2 py-1 font-medium text-navy-800"
                          />
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <select
                              value={l.lot}
                              onChange={(e) => update(i, { lot: e.target.value, validated: false })}
                              className="rounded border border-input bg-card px-1.5 py-0.5 text-xs text-muted-foreground"
                            >
                              {LOTS_BTP.map((lot) => <option key={lot} value={lot}>{lot}</option>)}
                              {!(LOTS_BTP as readonly string[]).includes(l.lot) && l.lot ? <option value={l.lot}>{l.lot}</option> : null}
                            </select>
                            <input
                              value={l.description ?? ""}
                              onChange={(e) => update(i, { description: e.target.value })}
                              placeholder="Notes (optionnel)"
                              className="flex-1 min-w-[120px] rounded border border-input bg-card px-1.5 py-0.5 text-xs text-muted-foreground"
                            />
                            {l.quantitySource ? <span className="text-[11px] text-muted-foreground/70">source: {l.quantitySource}</span> : null}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={l.unit}
                            onChange={(e) => update(i, { unit: e.target.value, validated: false })}
                            className="w-16 rounded border border-input bg-card px-1 py-1 text-muted-foreground"
                          >
                            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                            {!(UNITS as readonly string[]).includes(l.unit) && l.unit ? <option value={l.unit}>{l.unit}</option> : null}
                          </select>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input type="number" value={l.quantity} onChange={(e) => update(i, { quantity: +e.target.value, validated: false })} className="w-20 rounded border border-input bg-card px-2 py-1 text-right" />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input type="number" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: +e.target.value, validated: false })} className="w-24 rounded border border-input bg-card px-2 py-1 text-right" />
                        </td>
                        <td className="px-2 py-2 text-right font-medium text-navy-900">{money(l.quantity * l.unitPrice)}</td>
                        <td className="pl-2 py-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => update(i, { validated: !l.validated })} title="Valider la ligne">
                              <CheckCircle2 className={l.validated ? "size-5 text-success" : "size-5 text-muted-foreground/40"} />
                            </button>
                            <button onClick={() => removeLine(i)} title="Supprimer la ligne" className="text-muted-foreground/50 hover:text-destructive">
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold text-navy-900">
                      <td colSpan={5} className="pt-3 text-right">Total HT estimé</td>
                      <td className="pt-3 text-right">{money(total)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={addManualLine}>
                    <Plus className="size-4" /> Ajouter une ligne
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" disabled={!allValidated} onClick={() => exportDpgf("excel")}><FileDown className="size-4" /> Excel</Button>
                    <Button variant="outline" disabled={!allValidated} onClick={() => exportDpgf("docx")}><FileDown className="size-4" /> DOCX</Button>
                    <Button variant="gold" disabled={!allValidated} onClick={() => exportDpgf("pdf")}><FileDown className="size-4" /> PDF</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
