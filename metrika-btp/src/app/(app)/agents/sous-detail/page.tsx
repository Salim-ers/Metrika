"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatMAD } from "@/lib/utils";
import { LOTS_BTP, UNITS } from "@/lib/constants";
import { Loader2, Calculator, FileDown, Sparkles, Trash2, Plus, CheckCircle2 } from "lucide-react";

type CompType = "MAIN_OEUVRE" | "MATERIAUX" | "MATERIEL";

interface Component {
  type: CompType;
  designation: string;
  unit: string;
  quantity: number;
  unitCost: number;
}

const TYPE_LABELS: Record<CompType, string> = {
  MAIN_OEUVRE: "Main-d’œuvre",
  MATERIAUX: "Matériaux",
  MATERIEL: "Matériel",
};

const TYPE_ORDER: CompType[] = ["MAIN_OEUVRE", "MATERIAUX", "MATERIEL"];

export default function SousDetailPage() {
  const [designation, setDesignation] = useState("");
  const [unit, setUnit] = useState<string>("m²");
  const [lot, setLot] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [validated, setValidated] = useState(false);

  const [components, setComponents] = useState<Component[]>([]);
  const [yieldVal, setYieldVal] = useState(1);
  const [generalFeesRate, setGeneralFeesRate] = useState(0.1);
  const [profitRate, setProfitRate] = useState(0.1);

  async function generate() {
    if (!designation.trim()) {
      toast.error("Indiquez d’abord la désignation de l’ouvrage.");
      return;
    }
    setBusy(true);
    setValidated(false);
    try {
      const res = await fetch("/api/sous-detail/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designation, unit, lot: lot || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setComponents(data.components ?? []);
      setYieldVal(data.yield ?? 1);
      setGeneralFeesRate(data.generalFeesRate ?? 0.1);
      setProfitRate(data.profitRate ?? 0.1);
      setGenerated(true);
      toast.success("Sous-détail proposé. Ajustez les composants puis validez.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de génération");
    } finally {
      setBusy(false);
    }
  }

  function update(i: number, patch: Partial<Component>) {
    setComponents((arr) => arr.map((c, j) => (j === i ? { ...c, ...patch } : c)));
    setValidated(false);
  }

  function remove(i: number) {
    setComponents((arr) => arr.filter((_, j) => j !== i));
    setValidated(false);
  }

  function addComponent(type: CompType) {
    setComponents((arr) => [...arr, { type, designation: "", unit: "U", quantity: 1, unitCost: 0 }]);
    setValidated(false);
  }

  const debourseSec = components.reduce((s, c) => s + c.quantity * c.unitCost, 0);
  const sellingPrice = debourseSec * (1 + generalFeesRate) * (1 + profitRate);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Agent IA n°4"
        title="Sous-détail"
        accent="de prix"
        description="L’IA décompose un ouvrage en main-d’œuvre, matériaux et matériel. Vérifiez chaque poste avant d’exporter."
      />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-navy-900">Ouvrage à décomposer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Désignation</Label>
              <Input
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="Ex : Béton armé pour poteaux, dosé à 350 kg/m³"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Unité</Label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Lot</Label>
                <select
                  value={lot}
                  onChange={(e) => setLot(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">—</option>
                  {LOTS_BTP.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
            </div>
            <Button variant="gold" size="lg" className="w-full" disabled={busy} onClick={generate}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? "Analyse…" : "Générer le sous-détail"}
            </Button>

            {generated && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Rendement</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={yieldVal}
                      onChange={(e) => { setYieldVal(+e.target.value); setValidated(false); }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Frais généraux (%)</Label>
                      <Input
                        type="number"
                        step="1"
                        value={Math.round(generalFeesRate * 100)}
                        onChange={(e) => { setGeneralFeesRate(+e.target.value / 100); setValidated(false); }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Bénéfice (%)</Label>
                      <Input
                        type="number"
                        step="1"
                        value={Math.round(profitRate * 100)}
                        onChange={(e) => { setProfitRate(+e.target.value / 100); setValidated(false); }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!generated ? (
            <Card className="flex h-full min-h-[400px] items-center justify-center border-dashed">
              <div className="text-center">
                <Calculator className="mx-auto size-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Le sous-détail de prix s’affichera ici.
                </p>
              </div>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-navy-900">
                  {designation || "Ouvrage"}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">/ {unit}</span>
                </CardTitle>
                <Badge variant={validated ? "success" : "warning"}>
                  {validated ? "Validé" : "À valider"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-6">
                {TYPE_ORDER.map((type) => {
                  const rows = components
                    .map((c, idx) => ({ c, idx }))
                    .filter(({ c }) => c.type === type);
                  return (
                    <div key={type}>
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gold-600">
                          {TYPE_LABELS[type]}
                        </h3>
                        <button
                          onClick={() => addComponent(type)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-navy-700"
                        >
                          <Plus className="size-3.5" /> Ajouter
                        </button>
                      </div>
                      {rows.length === 0 ? (
                        <p className="text-xs italic text-muted-foreground/70">Aucun poste.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                              <th className="pb-1 pr-2">Poste</th>
                              <th className="pb-1 px-2">U.</th>
                              <th className="pb-1 px-2 text-right">Qté</th>
                              <th className="pb-1 px-2 text-right">Coût U.</th>
                              <th className="pb-1 px-2 text-right">Montant</th>
                              <th className="pb-1 pl-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(({ c, idx }) => (
                              <tr key={idx} className="border-b border-border/60">
                                <td className="py-1.5 pr-2">
                                  <input
                                    value={c.designation}
                                    onChange={(e) => update(idx, { designation: e.target.value })}
                                    className="w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-input focus:border-input"
                                    placeholder="Désignation"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    value={c.unit}
                                    onChange={(e) => update(idx, { unit: e.target.value })}
                                    className="w-12 rounded border border-input bg-card px-1 py-1"
                                  />
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  <input
                                    type="number"
                                    value={c.quantity}
                                    onChange={(e) => update(idx, { quantity: +e.target.value })}
                                    className="w-16 rounded border border-input bg-card px-2 py-1 text-right"
                                  />
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  <input
                                    type="number"
                                    value={c.unitCost}
                                    onChange={(e) => update(idx, { unitCost: +e.target.value })}
                                    className="w-24 rounded border border-input bg-card px-2 py-1 text-right"
                                  />
                                </td>
                                <td className="px-2 py-1.5 text-right font-medium text-navy-900">
                                  {formatMAD(c.quantity * c.unitCost)}
                                </td>
                                <td className="pl-2 py-1.5 text-right">
                                  <button onClick={() => remove(idx)} title="Supprimer">
                                    <Trash2 className="size-4 text-muted-foreground/50 hover:text-destructive" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })}

                <Separator />

                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Déboursé sec</span>
                    <span className="font-medium text-navy-800">{formatMAD(debourseSec)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Frais généraux ({Math.round(generalFeesRate * 100)} %)</span>
                    <span>{formatMAD(debourseSec * generalFeesRate)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Bénéfice ({Math.round(profitRate * 100)} %)</span>
                    <span>{formatMAD(debourseSec * (1 + generalFeesRate) * profitRate)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 text-base font-semibold text-navy-900">
                    <span>Prix de vente / {unit}</span>
                    <span className="text-gold-600">{formatMAD(sellingPrice)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant={validated ? "success" : "outline"}
                    onClick={() => { setValidated(true); toast.success("Sous-détail validé."); }}
                  >
                    <CheckCircle2 className="size-4" /> {validated ? "Validé" : "Valider"}
                  </Button>
                  <Button variant="outline" disabled={!validated} onClick={() => toast.info("Export Excel — branché sur le service ExcelJS.")}>
                    <FileDown className="size-4" /> Excel
                  </Button>
                  <Button variant="gold" disabled={!validated} onClick={() => toast.info("Export PDF.")}>
                    <FileDown className="size-4" /> PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
