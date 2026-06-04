"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatMoney, cn } from "@/lib/utils";
import { LOTS_BTP, UNITS } from "@/lib/constants";
import { getCompany } from "@/lib/client-data";
import { useCurrency, convertAmount } from "@/lib/use-currency";
import { Loader2, Calculator, FileDown, Sparkles, Trash2, Plus, ChevronDown } from "lucide-react";

type CompType = "MAIN_OEUVRE" | "MATERIAUX" | "MATERIEL";

interface Component {
  type: CompType;
  designation: string;
  unit: string;
  quantity: number;
  unitCost: number;
}

interface Ouvrage {
  id: number;
  designation: string;
  unit: string;
  lot?: string;
  components: Component[];
  generated: boolean;
  open: boolean;
}

const TYPE_LABELS: Record<CompType, string> = {
  MATERIAUX: "Matériaux / Fournitures",
  MATERIEL: "Matériel",
  MAIN_OEUVRE: "Main-d’œuvre",
};
const TYPE_ORDER: CompType[] = ["MATERIAUX", "MATERIEL", "MAIN_OEUVRE"];

const debourseSec = (o: Ouvrage) => o.components.reduce((s, c) => s + c.quantity * c.unitCost, 0);

export default function SousDetailPage() {
  const [pasteText, setPasteText] = useState("");
  const [defaultUnit, setDefaultUnit] = useState<string>("m²");
  const [defaultLot, setDefaultLot] = useState<string>("");
  const [ouvrages, setOuvrages] = useState<Ouvrage[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [validated, setValidated] = useState(false);
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);
  const idRef = useRef(1);

  const { currency, rate } = useCurrency();
  const money = (n: number) => formatMoney(n, currency);

  useEffect(() => { getCompany().then(setCompany); }, []);

  // Conversion des coûts unitaires au changement de devise.
  const prevCurrency = useRef(currency);
  useEffect(() => {
    if (prevCurrency.current !== currency) {
      const from = prevCurrency.current;
      setOuvrages((arr) => arr.map((o) => ({
        ...o,
        components: o.components.map((c) => ({ ...c, unitCost: convertAmount(c.unitCost, from, currency, rate) })),
      })));
      prevCurrency.current = currency;
    }
  }, [currency, rate]);

  function loadFromPaste() {
    const lines = pasteText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { toast.error("Collez au moins une désignation d’ouvrage."); return; }
    const items: Ouvrage[] = lines.map((line) => {
      // Format toléré : "désignation | unité" (sinon unité par défaut).
      const [desig, u] = line.split("|").map((s) => s.trim());
      return {
        id: idRef.current++, designation: desig, unit: u || defaultUnit, lot: defaultLot || undefined,
        components: [], generated: false, open: false,
      };
    });
    setOuvrages((arr) => [...arr, ...items]);
    setPasteText("");
    setValidated(false);
    toast.success(`${items.length} ouvrage(s) ajouté(s). Lancez la génération.`);
  }

  function addBlank() {
    setOuvrages((arr) => [...arr, { id: idRef.current++, designation: "", unit: defaultUnit, lot: defaultLot || undefined, components: [], generated: false, open: true }]);
    setValidated(false);
  }

  async function generateAll() {
    const targets = ouvrages.filter((o) => o.designation.trim() && !o.generated);
    if (targets.length === 0) { toast.error("Ajoutez des ouvrages (avec désignation) à décomposer."); return; }
    setBusy(true);
    setValidated(false);
    let done = 0;
    let failed = 0;
    // Traitement séquentiel léger (évite de saturer l'API ; déboursé sec par ouvrage).
    for (const o of targets) {
      setPhase(`Décomposition ${++done}/${targets.length}…`);
      try {
        const res = await fetch("/api/sous-detail/generate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ designation: o.designation, unit: o.unit, lot: o.lot }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const components: Component[] = (data.components ?? []).map((c: Component) => ({
          type: c.type, designation: c.designation, unit: c.unit, quantity: c.quantity, unitCost: c.unitCost,
        }));
        setOuvrages((arr) => arr.map((x) => x.id === o.id ? { ...x, components, generated: true, open: true } : x));
      } catch (e) {
        failed++;
        toast.error(`${o.designation.slice(0, 40)} : ${e instanceof Error ? e.message : "échec"}`);
      }
    }
    setBusy(false);
    setPhase("");
    if (failed < targets.length) toast.success(`${targets.length - failed}/${targets.length} sous-détail(s) générés.`);
  }

  function patchOuvrage(id: number, patch: Partial<Ouvrage>) {
    setOuvrages((arr) => arr.map((o) => o.id === id ? { ...o, ...patch } : o));
  }
  function removeOuvrage(id: number) {
    setOuvrages((arr) => arr.filter((o) => o.id !== id));
    setValidated(false);
  }
  function updateComp(id: number, ci: number, patch: Partial<Component>) {
    setOuvrages((arr) => arr.map((o) => o.id === id ? { ...o, components: o.components.map((c, j) => j === ci ? { ...c, ...patch } : c) } : o));
    setValidated(false);
  }
  function addComp(id: number, type: CompType) {
    setOuvrages((arr) => arr.map((o) => o.id === id ? { ...o, components: [...o.components, { type, designation: "", unit: "U", quantity: 1, unitCost: 0 }] } : o));
    setValidated(false);
  }
  function removeComp(id: number, ci: number) {
    setOuvrages((arr) => arr.map((o) => o.id === id ? { ...o, components: o.components.filter((_, j) => j !== ci) } : o));
    setValidated(false);
  }

  const ready = ouvrages.filter((o) => o.components.length > 0);
  const canExport = ready.length > 0 && validated;

  async function exportDs(kind: "excel" | "pdf") {
    try {
      const fresh = await getCompany(true);
      setCompany(fresh);
      const payload = ready.map((o) => ({ designation: o.designation || "Ouvrage", unit: o.unit, lot: o.lot, components: o.components }));
      const m = await import("@/lib/export-debourse-sec");
      const comp = { ...(fresh as object), currency } as never;
      if (kind === "excel") await m.exportDebourseSecExcel(payload, comp);
      else await m.exportDebourseSecPdf(payload, comp);
      toast.success("Export généré.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Étude de prix"
        title="Sous-détail"
        accent="de déboursé sec"
        description="Chaque ligne du DPGF devient un sous-détail de déboursé sec unitaire (main-d’œuvre, matériaux, matériel). Collez vos ouvrages, générez, ajustez, exportez."
      />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit">
          <CardHeader><CardTitle className="text-navy-900">Ouvrages à décomposer</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Désignations (une par ligne)</Label>
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                className="min-h-[150px] font-mono text-xs"
                placeholder={"Collez les lignes du DPGF, une par ligne.\nFormat toléré : Désignation | unité\nEx : Béton armé pour poteaux dosé à 350 kg/m³ | m³"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Unité par défaut</Label>
                <select value={defaultUnit} onChange={(e) => setDefaultUnit(e.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Lot (optionnel)</Label>
                <select value={defaultLot} onChange={(e) => setDefaultLot(e.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
                  <option value="">—</option>
                  {LOTS_BTP.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={loadFromPaste}><Plus className="size-4" /> Charger</Button>
              <Button variant="ghost" onClick={addBlank}><Plus className="size-4" /> Vide</Button>
            </div>
            <Button variant="gold" size="lg" className="w-full" disabled={busy || ouvrages.length === 0} onClick={generateAll}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? (phase || "Génération…") : "Générer les sous-détails"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Résultat : <strong>déboursé sec unitaire</strong> par ouvrage (sans frais généraux ni bénéfice).
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {ouvrages.length === 0 ? (
            <Card className="flex h-full min-h-[400px] items-center justify-center border-dashed">
              <div className="text-center">
                <Calculator className="mx-auto size-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">Les sous-détails de déboursé sec s’afficheront ici, un par ouvrage.</p>
              </div>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{ready.length}/{ouvrages.length} ouvrage(s) décomposé(s)</p>
                <div className="flex gap-2">
                  <Button variant={validated ? "success" : "outline"} size="sm" disabled={ready.length === 0} onClick={() => { setValidated(true); toast.success("Sous-détails validés."); }}>
                    {validated ? "Validé" : "Valider"}
                  </Button>
                  <Button variant="outline" size="sm" disabled={!canExport} onClick={() => exportDs("excel")}><FileDown className="size-4" /> Excel</Button>
                  <Button variant="gold" size="sm" disabled={!canExport} onClick={() => exportDs("pdf")}><FileDown className="size-4" /> PDF</Button>
                </div>
              </div>

              {ouvrages.map((o) => (
                <Card key={o.id} className="overflow-hidden">
                  <button type="button" onClick={() => patchOuvrage(o.id, { open: !o.open })} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/30">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", o.open && "rotate-180")} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-navy-900">{o.designation || "Nouvel ouvrage"}</span>
                        <span className="text-xs text-muted-foreground">/ {o.unit}{o.lot ? ` · ${o.lot}` : ""}</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-right">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Déboursé sec</span>
                        <span className="font-semibold text-gold-600">{money(debourseSec(o))}</span>
                      </span>
                      <Badge variant={o.components.length ? "success" : "muted"}>{o.components.length}</Badge>
                    </span>
                  </button>

                  {o.open && (
                    <CardContent className="space-y-4 border-t border-border/60 pt-4">
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                        <input value={o.designation} onChange={(e) => patchOuvrage(o.id, { designation: e.target.value })} placeholder="Désignation de l’ouvrage" className="w-full rounded border border-input bg-card px-2 py-1 text-sm font-medium text-navy-800" />
                        <select value={o.unit} onChange={(e) => patchOuvrage(o.id, { unit: e.target.value })} className="rounded border border-input bg-card px-2 py-1 text-sm">
                          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                          {!(UNITS as readonly string[]).includes(o.unit) && o.unit ? <option value={o.unit}>{o.unit}</option> : null}
                        </select>
                        <button onClick={() => removeOuvrage(o.id)} title="Supprimer l’ouvrage" className="text-muted-foreground/60 hover:text-destructive"><Trash2 className="size-4" /></button>
                      </div>

                      {TYPE_ORDER.map((type) => {
                        const rows = o.components.map((c, ci) => ({ c, ci })).filter(({ c }) => c.type === type);
                        return (
                          <div key={type}>
                            <div className="mb-1.5 flex items-center justify-between">
                              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gold-600">{TYPE_LABELS[type]}</h3>
                              <button onClick={() => addComp(o.id, type)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-navy-700"><Plus className="size-3.5" /> Ajouter</button>
                            </div>
                            {rows.length === 0 ? (
                              <p className="text-xs italic text-muted-foreground/60">Aucun poste.</p>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                                    <th className="pb-1 pr-2">Poste</th>
                                    <th className="pb-1 px-2">U.</th>
                                    <th className="pb-1 px-2 text-right">Qté</th>
                                    <th className="pb-1 px-2 text-right">Coût U.</th>
                                    <th className="pb-1 px-2 text-right">Montant</th>
                                    <th className="pb-1 pl-2"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map(({ c, ci }) => (
                                    <tr key={ci} className="border-b border-border/60">
                                      <td className="py-1.5 pr-2"><input value={c.designation} onChange={(e) => updateComp(o.id, ci, { designation: e.target.value })} className="w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-input focus:border-input" placeholder="Désignation" /></td>
                                      <td className="px-2 py-1.5"><input value={c.unit} onChange={(e) => updateComp(o.id, ci, { unit: e.target.value })} className="w-12 rounded border border-input bg-card px-1 py-1" /></td>
                                      <td className="px-2 py-1.5 text-right"><input type="number" value={c.quantity} onChange={(e) => updateComp(o.id, ci, { quantity: +e.target.value })} className="w-16 rounded border border-input bg-card px-2 py-1 text-right" /></td>
                                      <td className="px-2 py-1.5 text-right"><input type="number" value={c.unitCost} onChange={(e) => updateComp(o.id, ci, { unitCost: +e.target.value })} className="w-24 rounded border border-input bg-card px-2 py-1 text-right" /></td>
                                      <td className="px-2 py-1.5 text-right font-medium text-navy-900">{money(c.quantity * c.unitCost)}</td>
                                      <td className="pl-2 py-1.5 text-right"><button onClick={() => removeComp(o.id, ci)} title="Supprimer"><Trash2 className="size-4 text-muted-foreground/50 hover:text-destructive" /></button></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        );
                      })}

                      <div className="flex justify-between border-t pt-2 text-base font-semibold text-navy-900">
                        <span>Déboursé sec unitaire / {o.unit}</span>
                        <span className="text-gold-600">{money(debourseSec(o))}</span>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
