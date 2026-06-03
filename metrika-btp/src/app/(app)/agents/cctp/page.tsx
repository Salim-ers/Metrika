"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LOTS_BTP, PROJECT_TYPES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Loader2, FileText, ShieldCheck, FileDown, Sparkles } from "lucide-react";

interface Section { lot: string; content: string; validated?: boolean }

export default function CctpPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [projectType, setProjectType] = useState<string>(PROJECT_TYPES[0]);
  const [context, setContext] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [busy, setBusy] = useState(false);

  function toggle(lot: string) {
    setSelected((s) => (s.includes(lot) ? s.filter((l) => l !== lot) : [...s, lot]));
  }

  async function generate() {
    if (selected.length === 0) { toast.error("Sélectionnez au moins un lot."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/cctp/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lots: selected, projectType, context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSections(data.sections.map((s: Section) => ({ ...s, validated: false })));
      toast.success(`${data.sections.length} section(s) générée(s). Vérifiez puis validez.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const allValidated = sections.length > 0 && sections.every((s) => s.validated);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Agent IA n°2"
        title="Générateur de"
        accent="CCTP"
        description="Sélectionnez les lots, générez un CCTP structuré, modifiez-le, puis validez avant export."
      />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Paramètres */}
        <Card className="h-fit">
          <CardHeader><CardTitle className="text-navy-900">Paramètres du CCTP</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Type de projet</Label>
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Lots à inclure ({selected.length})</Label>
              <div className="flex flex-wrap gap-2">
                {LOTS_BTP.map((lot) => (
                  <button
                    key={lot}
                    onClick={() => toggle(lot)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      selected.includes(lot)
                        ? "border-gold-500 bg-gold-500 text-navy-900"
                        : "border-border bg-card text-navy-700 hover:border-gold-400"
                    )}
                  >
                    {lot}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Exigences particulières (optionnel)</Label>
              <Textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="Contraintes du projet, normes spécifiques, niveau de finition…" />
            </div>

            <Button variant="gold" size="lg" className="w-full" disabled={busy} onClick={generate}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? "Génération en cours…" : "Générer le CCTP"}
            </Button>
          </CardContent>
        </Card>

        {/* Résultat éditable */}
        <div className="space-y-4">
          {sections.length === 0 ? (
            <Card className="flex h-full min-h-[400px] items-center justify-center border-dashed">
              <div className="text-center">
                <FileText className="mx-auto size-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">Le CCTP généré apparaîtra ici, section par section.</p>
              </div>
            </Card>
          ) : (
            <>
              {sections.map((s, i) => (
                <Card key={i}>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-navy-900">{s.lot}</CardTitle>
                    <div className="flex items-center gap-2">
                      {s.validated ? <Badge variant="success">Validé</Badge> : <Badge variant="warning">À valider</Badge>}
                      <Button
                        variant={s.validated ? "outline" : "default"}
                        size="sm"
                        onClick={() => setSections((arr) => arr.map((x, j) => j === i ? { ...x, validated: !x.validated } : x))}
                      >
                        <ShieldCheck className="size-4" /> {s.validated ? "Dévalider" : "Valider"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={s.content}
                      onChange={(e) => setSections((arr) => arr.map((x, j) => j === i ? { ...x, content: e.target.value, validated: false } : x))}
                      className="min-h-[220px] font-mono text-xs leading-relaxed"
                    />
                  </CardContent>
                </Card>
              ))}

              <Card className="border-gold-200 bg-gold-50/40">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <p className="text-sm text-navy-800">
                    {allValidated
                      ? "Toutes les sections sont validées. Vous pouvez exporter le document officiel."
                      : "Validez toutes les sections pour débloquer l’export final."}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" disabled={!allValidated} onClick={() => toast.info("Export DOCX — branché sur le service docx (à finaliser).")}>
                      <FileDown className="size-4" /> DOCX
                    </Button>
                    <Button variant="gold" disabled={!allValidated} onClick={() => toast.info("Export PDF — branché sur le service de génération PDF (à finaliser).")}>
                      <FileDown className="size-4" /> PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
