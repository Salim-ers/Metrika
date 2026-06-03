"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LOTS_BTP, PROJECT_TYPES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Loader2, FileText, ShieldCheck, FileDown, Sparkles, Upload, X, ScanText } from "lucide-react";

interface Section { lot: string; content: string; validated?: boolean }

export default function CctpPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [projectType, setProjectType] = useState<string>(PROJECT_TYPES[0]);
  const [context, setContext] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [planFiles, setPlanFiles] = useState<File[]>([]);
  const [planContext, setPlanContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch("/api/company").then((r) => (r.ok ? r.json() : { company: null })).then((d) => setCompany(d.company ?? null)).catch(() => {});
  }, []);

  function toggle(lot: string) {
    setSelected((s) => (s.includes(lot) ? s.filter((l) => l !== lot) : [...s, lot]));
  }

  async function generate() {
    if (selected.length === 0) { toast.error("Sélectionnez au moins un lot."); return; }
    setBusy(true);
    try {
      // Rastérisation des plans PDF côté navigateur (images légères pour Claude).
      const planImages: { data: string; mediaType: string }[] = [];
      if (planFiles.length > 0) {
        setPhase("Lecture des plans…");
        const { rasterizePdf } = await import("@/lib/pdf-render");
        for (const f of planFiles) planImages.push(...(await rasterizePdf(f)));
        const totalChars = planImages.reduce((n, im) => n + im.data.length, 0);
        if (totalChars > 3_800_000) {
          toast.error("Plans trop volumineux. Réduisez le nombre de pages/plans à envoyer.");
          setBusy(false); setPhase(""); return;
        }
      }

      setPhase(planImages.length ? "Analyse des plans + génération…" : "Génération…");
      const res = await fetch("/api/cctp/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lots: selected, projectType, context, planImages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSections(data.sections.map((s: Section) => ({ ...s, validated: false })));
      setPlanContext(data.planContext ?? "");
      toast.success(`${data.sections.length} section(s) générée(s). Vérifiez puis validez.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
      setPhase("");
    }
  }

  const allValidated = sections.length > 0 && sections.every((s) => s.validated);

  async function exportCctp(kind: "docx" | "pdf") {
    try {
      const m = await import("@/lib/export-cctp");
      const data = sections.map((s) => ({ lot: s.lot, content: s.content }));
      if (kind === "docx") await m.exportCctpDocx(data);
      else await m.exportCctpPdf(data, company as never);
      toast.success("Export généré.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    }
  }

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
              <Label>Plans du projet (PDF, optionnel)</Label>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 py-5 text-center transition-colors hover:border-gold-400 hover:bg-gold-50/40">
                <Upload className="size-4 text-navy-600" />
                <span className="mt-1 text-xs font-medium text-navy-800">Ajouter des plans PDF</span>
                <span className="text-[11px] text-muted-foreground">Claude lit les plans pour adapter le CCTP</span>
                <input
                  type="file"
                  accept="application/pdf"
                  multiple
                  hidden
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []);
                    setPlanFiles((p) => [...p, ...list]);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              {planFiles.length > 0 && (
                <ul className="space-y-1.5">
                  {planFiles.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-navy-800">{f.name}</span>
                      <button onClick={() => setPlanFiles((p) => p.filter((_, j) => j !== i))} className="text-destructive hover:opacity-70">
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <Label>Exigences particulières (optionnel)</Label>
              <Textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="Contraintes du projet, normes spécifiques, niveau de finition…" />
            </div>

            <Button variant="gold" size="lg" className="w-full" disabled={busy} onClick={generate}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? (phase || "Génération en cours…") : "Générer le CCTP"}
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
              {planContext && (
                <Card className="border-navy-100 bg-navy-50/40">
                  <CardHeader className="flex-row items-center gap-2">
                    <ScanText className="size-4 text-navy-600" />
                    <CardTitle className="text-sm text-navy-900">Synthèse des plans (lue par l’IA)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-navy-700">{planContext}</pre>
                  </CardContent>
                </Card>
              )}
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
                    <Button variant="outline" disabled={!allValidated} onClick={() => exportCctp("docx")}>
                      <FileDown className="size-4" /> DOCX
                    </Button>
                    <Button variant="gold" disabled={!allValidated} onClick={() => exportCctp("pdf")}>
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
