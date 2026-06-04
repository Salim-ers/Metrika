"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatMAD } from "@/lib/utils";
import { PdfDropzone } from "@/components/ui/pdf-dropzone";
import { getCompany } from "@/lib/client-data";
import { Loader2, Table2, CheckCircle2, FileDown, Sparkles, FileText, X } from "lucide-react";

interface Line {
  lot: string; code?: string; designation: string; description?: string;
  unit: string; quantity: number; unitPrice: number; quantitySource?: string; validated: boolean;
}

export default function DpgfPage() {
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
      // Rastérisation du/des CCTP PDF → images lues nativement par Claude.
      const cctpImages: { data: string; mediaType: string }[] = [];
      if (cctpFiles.length > 0) {
        setPhase("Lecture du CCTP…");
        const { rasterizePdf } = await import("@/lib/pdf-render");
        for (const f of cctpFiles) cctpImages.push(...(await rasterizePdf(f)));
        const totalChars = cctpImages.reduce((n, im) => n + im.data.length, 0);
        if (totalChars > 3_800_000) {
          toast.error("CCTP trop volumineux. Réduisez le nombre de pages, ou collez le texte.");
          setBusy(false); setPhase(""); return;
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

  async function exportDpgf(kind: "excel" | "docx" | "pdf") {
    try {
      const fresh = await getCompany(true); // logo/cachet toujours à jour
      setCompany(fresh);
      const m = await import("@/lib/export-dpgf");
      if (kind === "excel") await m.exportDpgfExcel(lines, fresh as never);
      else if (kind === "docx") await m.exportDpgfDocx(lines, fresh as never);
      else await m.exportDpgfPdf(lines, fresh as never);
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
        title="Conversion"
        accent="CCTP → DPGF"
        description="Extraction des ouvrages et proposition de quantités. Chaque ligne doit être validée par vous avant export."
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
          </CardContent>
        </Card>

        <div className="space-y-4">
          {lines.length === 0 ? (
            <Card className="flex h-full min-h-[400px] items-center justify-center border-dashed">
              <div className="text-center">
                <Table2 className="mx-auto size-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">Le tableau DPGF apparaîtra ici.</p>
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
                      <th className="pb-2 pr-2">Désignation</th>
                      <th className="pb-2 px-2">U.</th>
                      <th className="pb-2 px-2 text-right">Qté</th>
                      <th className="pb-2 px-2 text-right">P.U. (MAD)</th>
                      <th className="pb-2 px-2 text-right">Total</th>
                      <th className="pb-2 pl-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i} className="border-b border-border/60 align-top">
                        <td className="py-2 pr-2">
                          <p className="font-medium text-navy-800">{l.designation}</p>
                          <p className="text-xs text-muted-foreground">{l.lot}{l.quantitySource ? ` · source: ${l.quantitySource}` : ""}</p>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{l.unit}</td>
                        <td className="px-2 py-2 text-right">
                          <input type="number" value={l.quantity} onChange={(e) => update(i, { quantity: +e.target.value, validated: false })} className="w-20 rounded border border-input bg-card px-2 py-1 text-right" />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input type="number" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: +e.target.value, validated: false })} className="w-24 rounded border border-input bg-card px-2 py-1 text-right" />
                        </td>
                        <td className="px-2 py-2 text-right font-medium text-navy-900">{formatMAD(l.quantity * l.unitPrice)}</td>
                        <td className="pl-2 py-2 text-right">
                          <button onClick={() => update(i, { validated: !l.validated })} title="Valider la ligne">
                            <CheckCircle2 className={l.validated ? "size-5 text-success" : "size-5 text-muted-foreground/40"} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold text-navy-900">
                      <td colSpan={4} className="pt-3 text-right">Total HT estimé</td>
                      <td className="pt-3 text-right">{formatMAD(total)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>

                <div className="mt-5 flex justify-end gap-2">
                  <Button variant="outline" disabled={!allValidated} onClick={() => exportDpgf("excel")}><FileDown className="size-4" /> Excel</Button>
                  <Button variant="outline" disabled={!allValidated} onClick={() => exportDpgf("docx")}><FileDown className="size-4" /> DOCX</Button>
                  <Button variant="gold" disabled={!allValidated} onClick={() => exportDpgf("pdf")}><FileDown className="size-4" /> PDF</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
