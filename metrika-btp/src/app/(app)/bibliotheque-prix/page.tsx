"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatMAD, formatDate } from "@/lib/utils";
import { LOTS_BTP, UNITS } from "@/lib/constants";
import { Search, Plus, Library, Upload, Trash2, Sparkles, Loader2 } from "lucide-react";

interface PriceItem {
  id: string;
  designation: string;
  unit: string;
  unitPrice: number;
  category?: string;
  lot?: string;
  supplier?: string;
  source?: string;
  marginRate: number;
  generalFeesRate: number;
  sellingPrice: number;
  updatedAt: string;
}

function computeSelling(unitPrice: number, gf: number, margin: number) {
  return Math.round(unitPrice * (1 + gf) * (1 + margin) * 100) / 100;
}

// Données de démarrage (cf. prisma/seed.ts). Remplacées par la BD une fois branchée.
const SEED: Omit<PriceItem, "id" | "sellingPrice" | "updatedAt">[] = [
  { designation: "Béton armé dosé à 350 kg/m³", unit: "m³", unitPrice: 1100, lot: "Gros Œuvre", category: "Béton", marginRate: 0.1, generalFeesRate: 0.1 },
  { designation: "Maçonnerie agglos creux 20 cm", unit: "m²", unitPrice: 120, lot: "Gros Œuvre", category: "Maçonnerie", marginRate: 0.1, generalFeesRate: 0.1 },
  { designation: "Enduit ciment sur murs", unit: "m²", unitPrice: 65, lot: "Revêtements", category: "Enduit", marginRate: 0.1, generalFeesRate: 0.1 },
  { designation: "Carrelage grès cérame 60x60", unit: "m²", unitPrice: 180, lot: "Revêtements", category: "Sol", marginRate: 0.1, generalFeesRate: 0.1 },
  { designation: "Peinture vinylique 2 couches", unit: "m²", unitPrice: 35, lot: "Peinture", category: "Mur", marginRate: 0.1, generalFeesRate: 0.1 },
];

const emptyForm = {
  designation: "", unit: "m²", unitPrice: 0, lot: "", category: "",
  supplier: "", source: "Saisie manuelle", marginRate: 0.1, generalFeesRate: 0.1,
};

export default function BibliothequePrixPage() {
  const [items, setItems] = useState<PriceItem[]>(() =>
    SEED.map((p, i) => ({
      ...p,
      id: `seed-${i}`,
      source: "Référence Maroc",
      sellingPrice: computeSelling(p.unitPrice, p.generalFeesRate, p.marginRate),
      updatedAt: new Date().toISOString(),
    }))
  );
  const [query, setQuery] = useState("");
  const [lotFilter, setLotFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [suggesting, setSuggesting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      const matchQ = !q || it.designation.toLowerCase().includes(q) || (it.category ?? "").toLowerCase().includes(q);
      const matchLot = !lotFilter || it.lot === lotFilter;
      return matchQ && matchLot;
    });
  }, [items, query, lotFilter]);

  function addItem() {
    if (!form.designation.trim()) { toast.error("La désignation est requise."); return; }
    const item: PriceItem = {
      ...form,
      id: `new-${Date.now()}`,
      lot: form.lot || undefined,
      category: form.category || undefined,
      supplier: form.supplier || undefined,
      sellingPrice: computeSelling(form.unitPrice, form.generalFeesRate, form.marginRate),
      updatedAt: new Date().toISOString(),
    };
    setItems((arr) => [item, ...arr]);
    setForm(emptyForm);
    setShowForm(false);
    toast.success("Prix ajouté à la bibliothèque.");
  }

  function remove(id: string) {
    setItems((arr) => arr.filter((it) => it.id !== id));
  }

  async function suggest() {
    if (!form.designation.trim()) { toast.error("Indiquez d’abord une désignation."); return; }
    setSuggesting(true);
    try {
      const res = await fetch("/api/pricing/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designation: form.designation, lot: form.lot || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm((f) => ({
        ...f,
        unitPrice: data.unitPrice ?? f.unitPrice,
        marginRate: data.marginRate ?? f.marginRate,
        generalFeesRate: data.generalFeesRate ?? f.generalFeesRate,
        source: `IA · ${data.confidence ?? "estimation"}`,
      }));
      toast.success("Prix proposé par l’IA. Ajustez si besoin.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Production"
        title="Bibliothèque"
        accent="de prix"
        description="Référentiel de prix unitaires alimentant les DPGF, sous-détails et devis. L’IA peut proposer des prix adaptés au marché marocain."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => toast.info("Import Excel — branché sur le service ExcelJS.")}>
              <Upload className="size-4" /> Importer Excel
            </Button>
            <Button variant="gold" onClick={() => setShowForm((s) => !s)}>
              <Plus className="size-4" /> Nouveau prix
            </Button>
          </div>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <CardContent className="grid gap-4 pt-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Désignation</Label>
              <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Ex : Cloison placo BA13 sur ossature" />
            </div>
            <div className="space-y-2">
              <Label>Unité</Label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Lot</Label>
              <select value={form.lot} onChange={(e) => setForm({ ...form, lot: e.target.value })} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
                <option value="">—</option>
                {LOTS_BTP.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Déboursé / P.U. (MAD)</Label>
              <Input type="number" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: +e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Frais généraux (%)</Label>
              <Input type="number" value={Math.round(form.generalFeesRate * 100)} onChange={(e) => setForm({ ...form, generalFeesRate: +e.target.value / 100 })} />
            </div>
            <div className="space-y-2">
              <Label>Marge (%)</Label>
              <Input type="number" value={Math.round(form.marginRate * 100)} onChange={(e) => setForm({ ...form, marginRate: +e.target.value / 100 })} />
            </div>
            <div className="space-y-2">
              <Label>Fournisseur</Label>
              <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Optionnel" />
            </div>
            <div className="flex items-end gap-2 lg:col-span-4">
              <div className="mr-auto text-sm text-muted-foreground">
                Prix de vente calculé :{" "}
                <span className="font-semibold text-gold-600">
                  {formatMAD(computeSelling(form.unitPrice, form.generalFeesRate, form.marginRate))}
                </span>
              </div>
              <Button variant="outline" disabled={suggesting} onClick={suggest}>
                {suggesting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Proposer par IA
              </Button>
              <Button variant="ghost" onClick={() => { setShowForm(false); setForm(emptyForm); }}>Annuler</Button>
              <Button variant="gold" onClick={addItem}>Enregistrer</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une désignation, catégorie…" className="pl-9" />
        </div>
        <select value={lotFilter} onChange={(e) => setLotFilter(e.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm">
          <option value="">Tous les lots</option>
          {LOTS_BTP.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <Badge variant="muted">{filtered.length} article(s)</Badge>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {filtered.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
              <Library className="size-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">Aucun prix ne correspond à votre recherche.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Désignation</th>
                  <th className="px-3 py-3">Lot</th>
                  <th className="px-3 py-3">U.</th>
                  <th className="px-3 py-3 text-right">Déboursé</th>
                  <th className="px-3 py-3 text-right">Prix vente</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">MàJ</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => (
                  <tr key={it.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-navy-800">{it.designation}</p>
                      {it.category && <p className="text-xs text-muted-foreground">{it.category}{it.supplier ? ` · ${it.supplier}` : ""}</p>}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{it.lot ?? "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{it.unit}</td>
                    <td className="px-3 py-3 text-right text-navy-800">{formatMAD(it.unitPrice)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-gold-600">{formatMAD(it.sellingPrice)}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{it.source ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(it.updatedAt)}</td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => remove(it.id)} title="Supprimer">
                        <Trash2 className="size-4 text-muted-foreground/50 hover:text-destructive" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Note : les prix sont chargés depuis les données de démarrage. Une fois la base PostgreSQL connectée,
        cette bibliothèque persiste les articles, l’historique des prix et l’import Excel.
      </p>
    </div>
  );
}
