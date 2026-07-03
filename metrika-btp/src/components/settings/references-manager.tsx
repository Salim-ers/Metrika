"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { LOTS_BTP } from "@/lib/constants";
import { BookOpen, Plus, Trash2, Loader2 } from "lucide-react";

interface RefRow {
  id: string;
  jurisdiction: string;
  lot?: string | null;
  code: string;
  title: string;
  version?: string | null;
}

/**
 * Bibliothèque de références réglementaires versionnée (France / Maroc).
 * Alimentée par l'utilisateur — AUCUNE référence n'est pré-remplie ni
 * inventée. Les références configurées sont injectées en priorité dans la
 * génération CCTP (directive de juridiction).
 */
export function ReferencesManager() {
  const [refs, setRefs] = useState<RefRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ jurisdiction: "Maroc", lot: "", code: "", title: "", version: "" });

  const load = useCallback(() => {
    fetch("/api/references")
      .then((r) => r.json())
      .then((d) => setRefs(d.references ?? []))
      .catch(() => setRefs([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!form.code.trim() || !form.title.trim()) {
      toast.error("Code et intitulé sont requis (ex. « NF DTU 20.1 » / « Ouvrages en maçonnerie »).");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/references", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, lot: form.lot || undefined, version: form.version || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setForm((f) => ({ ...f, code: "", title: "", version: "" }));
      load();
      toast.success("Référence ajoutée à la bibliothèque.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ajout impossible.");
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/references?id=${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  const input = "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
  const byJurisdiction = (j: string) => (refs ?? []).filter((r) => r.jurisdiction === j);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-navy-900">
          <BookOpen className="size-4 text-navy-600" /> Références réglementaires (bibliothèque validée)
        </CardTitle>
        <CardDescription>
          Normes et référentiels que VOUS validez (NF DTU, NM, RPS 2000…). Ils sont cités en priorité dans les CCTP
          générés, par juridiction et par lot. Rien n’est pré-rempli : une référence non configurée et non présente
          dans les pièces sources reste marquée « à préciser » dans le document.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Formulaire d'ajout */}
        <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-[110px_150px_150px_1fr_90px_auto]">
          <div className="space-y-1">
            <Label className="text-[11px]">Juridiction</Label>
            <select className={input} value={form.jurisdiction} onChange={(e) => setForm((f) => ({ ...f, jurisdiction: e.target.value }))}>
              <option value="Maroc">Maroc</option>
              <option value="France">France</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Lot (optionnel)</Label>
            <select className={input} value={form.lot} onChange={(e) => setForm((f) => ({ ...f, lot: e.target.value }))}>
              <option value="">Tous lots</option>
              {LOTS_BTP.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Code *</Label>
            <input className={input} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="NF DTU 20.1" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Intitulé *</Label>
            <input className={input} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ouvrages en maçonnerie de petits éléments" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Édition</Label>
            <input className={input} value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} placeholder="2008" />
          </div>
          <div className="flex items-end">
            <Button variant="gold" size="sm" disabled={adding} onClick={add}>
              {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Ajouter
            </Button>
          </div>
        </div>

        {/* Listes par juridiction */}
        {refs === null ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : refs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune référence configurée pour l’instant.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {(["Maroc", "France"] as const).map((j) => (
              <div key={j}>
                <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {j} <Badge variant="muted">{byJurisdiction(j).length}</Badge>
                </p>
                {byJurisdiction(j).length === 0 ? (
                  <p className="text-xs italic text-muted-foreground/70">Aucune référence.</p>
                ) : (
                  <ul className="space-y-1">
                    {byJurisdiction(j).map((r) => (
                      <li key={r.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
                        <span className="shrink-0 font-semibold text-navy-800">{r.code}</span>
                        <span className="min-w-0 flex-1 truncate text-navy-700" title={r.title}>{r.title}</span>
                        {r.lot ? <Badge variant="outline">{r.lot}</Badge> : null}
                        {r.version ? <span className="shrink-0 text-muted-foreground">({r.version})</span> : null}
                        <button onClick={() => remove(r.id)} title="Supprimer" className="shrink-0 text-muted-foreground/50 hover:text-destructive">
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
