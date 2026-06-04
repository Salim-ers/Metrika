"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MetrikaLogo } from "@/components/layout/metrika-logo";
import { formatMoney, formatDate, buildQuoteNumber } from "@/lib/utils";
import { getCompany, getPrices } from "@/lib/client-data";
import { UNITS } from "@/lib/constants";
import { Plus, Trash2, FileDown, CheckCircle2, ReceiptText, Library, Upload, Loader2 } from "lucide-react";

interface Line {
  designation: string;
  description?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}

interface PriceItem {
  id: string; designation: string; unit: string;
  unitPrice: number; sellingPrice: number; lot?: string | null; category?: string | null;
}

const VAT_RATE = 20;

export default function DevisPage() {
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [projectName, setProjectName] = useState("");
  const [validity, setValidity] = useState("30");
  const [lines, setLines] = useState<Line[]>([
    { designation: "", unit: "m²", quantity: 1, unitPrice: 0 },
  ]);
  const [validated, setValidated] = useState(false);
  const [prices, setPrices] = useState<PriceItem[]>([]);
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    getPrices().then((items) => setPrices(items as never));
    getCompany().then(setCompany);
  }, []);

  const currency = (company?.currency as string) || "MAD";
  const vatRate = Number(company?.vatRate) || VAT_RATE;
  const money = (n: number) => formatMoney(n, currency);

  function pickFromLibrary(i: number, priceId: string) {
    const p = prices.find((x) => x.id === priceId);
    if (!p) return;
    update(i, { designation: p.designation, unit: p.unit, unitPrice: p.sellingPrice });
  }

  const [importing, setImporting] = useState(false);
  async function importPdf(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    try {
      const { rasterizePdf } = await import("@/lib/pdf-render");
      const images = await rasterizePdf(file);
      const totalChars = images.reduce((n, im) => n + im.data.length, 0);
      if (totalChars > 3_800_000) { toast.error("PDF trop volumineux. Réduisez le nombre de pages."); return; }
      const res = await fetch("/api/devis/extract", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const extracted: Line[] = (data.lines ?? []).map((l: Line) => ({
        designation: l.designation, unit: l.unit || "U", quantity: l.quantity || 1, unitPrice: l.unitPrice || 0,
      }));
      if (extracted.length === 0) { toast.error("Aucune ligne détectée dans le PDF."); return; }
      setLines((prev) => [...prev.filter((l) => l.designation.trim()), ...extracted]);
      setValidated(false);
      toast.success(`${extracted.length} ligne(s) importée(s). Vérifiez et complétez les prix.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import impossible");
    } finally {
      setImporting(false);
    }
  }

  const quoteNumber = buildQuoteNumber("DEV", 1);
  const today = new Date();

  function update(i: number, patch: Partial<Line>) {
    setLines((arr) => arr.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setValidated(false);
  }
  function addLine() {
    setLines((arr) => [...arr, { designation: "", unit: "m²", quantity: 1, unitPrice: 0 }]);
    setValidated(false);
  }
  function remove(i: number) {
    setLines((arr) => arr.filter((_, j) => j !== i));
    setValidated(false);
  }

  const totalHT = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const totalVAT = totalHT * (vatRate / 100);
  const totalTTC = totalHT + totalVAT;
  const canValidate = clientName.trim() !== "" && lines.some((l) => l.designation.trim() && l.unitPrice > 0);

  async function exportDevis(kind: "pdf" | "excel" | "docx") {
    try {
      const m = await import("@/lib/export-devis");
      const data = {
        quoteNumber,
        dateLabel: formatDate(today),
        validity,
        vatRate,
        clientName,
        clientAddress,
        projectName,
        lines,
        company: company as never,
      };
      if (kind === "pdf") await m.exportDevisPdf(data);
      else if (kind === "excel") await m.exportDevisExcel(data);
      else await m.exportDevisDocx(data);
      toast.success("Devis exporté.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Production"
        title="Générateur"
        accent="de devis"
        description="Composez un devis premium aux couleurs Metrika. Vérifiez l’aperçu avant d’éditer le document officiel."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        {/* ── Saisie ─────────────────────────────── */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-navy-900">Client & projet</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Client</Label>
                <Input value={clientName} onChange={(e) => { setClientName(e.target.value); setValidated(false); }} placeholder="Raison sociale du client" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Adresse client</Label>
                <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Adresse complète" />
              </div>
              <div className="space-y-2">
                <Label>Projet</Label>
                <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Intitulé du projet" />
              </div>
              <div className="space-y-2">
                <Label>Validité (jours)</Label>
                <Input type="number" value={validity} onChange={(e) => setValidity(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-navy-900">Lignes du devis</CardTitle>
              <div className="flex gap-2">
                <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-sm font-medium hover:border-gold-400 ${importing ? "pointer-events-none opacity-60" : ""}`}>
                  {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Importer un PDF
                  <input type="file" accept="application/pdf" hidden onChange={(e) => { importPdf(e.target.files?.[0]); e.currentTarget.value = ""; }} />
                </label>
                <Button variant="outline" size="sm" onClick={addLine}><Plus className="size-4" /> Ligne</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {lines.map((l, i) => (
                <div key={i} className="rounded-lg border border-border/70 p-3">
                  {prices.length > 0 && (
                    <div className="mb-2 flex items-center gap-2">
                      <Library className="size-3.5 shrink-0 text-gold-600" />
                      <select
                        value=""
                        onChange={(e) => { pickFromLibrary(i, e.target.value); e.currentTarget.value = ""; }}
                        className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs text-muted-foreground"
                      >
                        <option value="">Choisir dans la bibliothèque de prix… (ou saisir manuellement)</option>
                        {prices.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.designation} — {money(p.sellingPrice)}/{p.unit}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="mb-2 flex items-start gap-2">
                    <Input
                      value={l.designation}
                      onChange={(e) => update(i, { designation: e.target.value })}
                      placeholder="Désignation de l’ouvrage (ou choisir ci-dessus)"
                      className="flex-1"
                    />
                    <button onClick={() => remove(i)} title="Supprimer" className="mt-2">
                      <Trash2 className="size-4 text-muted-foreground/50 hover:text-destructive" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Unité</Label>
                      <select value={l.unit} onChange={(e) => update(i, { unit: e.target.value })} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Quantité</Label>
                      <Input type="number" value={l.quantity} onChange={(e) => update(i, { quantity: +e.target.value })} className="h-9" />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">P.U. (MAD)</Label>
                      <Input type="number" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: +e.target.value })} className="h-9" />
                    </div>
                  </div>
                  <p className="mt-2 text-right text-xs text-muted-foreground">
                    Total ligne : <span className="font-medium text-navy-800">{money(l.quantity * l.unitPrice)}</span>
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant={validated ? "success" : "outline"}
              disabled={!canValidate}
              onClick={() => { setValidated(true); toast.success("Devis validé. Vous pouvez l’exporter."); }}
            >
              <CheckCircle2 className="size-4" /> {validated ? "Validé" : "Valider le devis"}
            </Button>
            <Button variant="outline" disabled={!validated} onClick={() => exportDevis("excel")}><FileDown className="size-4" /> Excel</Button>
            <Button variant="outline" disabled={!validated} onClick={() => exportDevis("docx")}><FileDown className="size-4" /> DOCX</Button>
            <Button variant="gold" disabled={!validated} onClick={() => exportDevis("pdf")}><FileDown className="size-4" /> PDF</Button>
          </div>
        </div>

        {/* ── Aperçu premium ─────────────────────── */}
        <div className="xl:sticky xl:top-6 xl:h-fit">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-600">Aperçu</p>
            <Badge variant={validated ? "success" : "warning"}>{validated ? "Validé" : "Brouillon"}</Badge>
          </div>
          <div className="overflow-hidden rounded-xl border bg-white shadow-card">
            {/* En-tête */}
            <div className="flex items-start justify-between gap-4 border-b border-navy-100 px-8 pt-8 pb-6">
              <MetrikaLogo variant="dark" className="h-10 w-auto" />
              <div className="text-right">
                <p className="font-display text-2xl font-semibold text-navy-900">DEVIS</p>
                <p className="text-sm text-gold-600">{quoteNumber}</p>
              </div>
            </div>

            {/* Émetteur / client */}
            <div className="grid grid-cols-2 gap-6 px-8 py-6 text-sm">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gold-600">Émetteur</p>
                <p className="font-semibold text-navy-900">Metrika Métrage BTP</p>
                <p className="text-muted-foreground">Maroc</p>
                <p className="text-xs text-muted-foreground">ICE / RC / IF — voir paramètres entreprise</p>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gold-600">Client</p>
                <p className="font-semibold text-navy-900">{clientName || "—"}</p>
                <p className="text-muted-foreground">{clientAddress || ""}</p>
                {projectName && <p className="mt-1 text-xs text-muted-foreground">Projet : {projectName}</p>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 px-8 pb-6 text-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gold-600">Date</p>
                <p className="text-navy-900">{formatDate(today)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gold-600">Validité</p>
                <p className="text-navy-900">{validity} jours</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gold-600">TVA</p>
                <p className="text-navy-900">{vatRate} %</p>
              </div>
            </div>

            {/* Tableau */}
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-900 text-left text-[10px] uppercase tracking-wider text-white">
                  <th className="px-8 py-3">Désignation</th>
                  <th className="px-2 py-3 text-center">Qté</th>
                  <th className="px-2 py-3 text-right">P.U.</th>
                  <th className="px-8 py-3 text-right">Total HT</th>
                </tr>
              </thead>
              <tbody>
                {lines.filter((l) => l.designation.trim()).length === 0 ? (
                  <tr><td colSpan={4} className="px-8 py-8 text-center text-muted-foreground">Ajoutez des lignes pour composer le devis.</td></tr>
                ) : (
                  lines.filter((l) => l.designation.trim()).map((l, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="px-8 py-3">
                        <p className="font-medium text-navy-800">{l.designation}</p>
                        <p className="text-xs text-muted-foreground">{l.unit}</p>
                      </td>
                      <td className="px-2 py-3 text-center text-navy-700">{l.quantity}</td>
                      <td className="px-2 py-3 text-right text-navy-700">{money(l.unitPrice)}</td>
                      <td className="px-8 py-3 text-right font-medium text-navy-900">{money(l.quantity * l.unitPrice)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Totaux */}
            <div className="flex justify-end px-8 py-6">
              <div className="w-64 space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Total HT</span><span className="font-medium text-navy-800">{money(totalHT)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>TVA ({vatRate} %)</span><span>{money(totalVAT)}</span>
                </div>
                <div className="flex justify-between border-t border-navy-200 pt-2 text-base font-semibold text-navy-900">
                  <span>Total TTC</span><span className="text-gold-600">{money(totalTTC)}</span>
                </div>
              </div>
            </div>

            {/* Pied */}
            <div className="border-t border-navy-100 px-8 py-5 text-xs text-muted-foreground">
              <p>Conditions de paiement et coordonnées bancaires renseignées depuis les paramètres entreprise.</p>
              <p className="mt-1">Devis établi le {formatDate(today)} · Metrika Métrage BTP Maroc</p>
            </div>
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ReceiptText className="size-3.5" />
            L’export PDF reprend cette mise en page avec logo, mentions légales et cachet.
          </p>
        </div>
      </div>
    </div>
  );
}
