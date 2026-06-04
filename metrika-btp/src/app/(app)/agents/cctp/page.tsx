"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LOTS_BTP, PROJECT_TYPES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { PdfDropzone } from "@/components/ui/pdf-dropzone";
import { getCompany } from "@/lib/client-data";
import { Loader2, FileText, ShieldCheck, FileDown, Sparkles, X, ScanText, ChevronDown, ChevronsDownUp, ChevronsUpDown, Timer } from "lucide-react";

interface Section { lot: string; content: string; validated?: boolean }

/** Formate des secondes en mm:ss. */
function fmtDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function CctpPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [projectType, setProjectType] = useState<string>(PROJECT_TYPES[0]);
  const [projectName, setProjectName] = useState("");
  const [owner, setOwner] = useState("");
  const [architect, setArchitect] = useState("");
  const [bet, setBet] = useState("");
  const [context, setContext] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [planFiles, setPlanFiles] = useState<File[]>([]);
  const [planContext, setPlanContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [deep, setDeep] = useState(true); // mode exhaustif (multi-passes) par défaut
  const [elapsed, setElapsed] = useState(0); // chronomètre (secondes)
  const [lastDuration, setLastDuration] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { getCompany().then(setCompany); }, []);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function startTimer() {
    setElapsed(0);
    setLastDuration(null);
    const t0 = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return t0;
  }
  function stopTimer(t0: number) {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setLastDuration(Math.round((Date.now() - t0) / 1000));
  }

  function toggle(lot: string) {
    setSelected((s) => (s.includes(lot) ? s.filter((l) => l !== lot) : [...s, lot]));
  }
  function toggleOpen(i: number) {
    setOpen((o) => ({ ...o, [i]: !o[i] }));
  }
  function setAllOpen(value: boolean) {
    setOpen(Object.fromEntries(sections.map((_, i) => [i, value])));
  }

  async function generate() {
    if (selected.length === 0) { toast.error("Sélectionnez au moins un lot."); return; }
    setBusy(true);
    const t0 = startTimer();
    try {
      // Rastérisation des plans PDF côté navigateur (images légères pour Claude).
      const planImages: { data: string; mediaType: string }[] = [];
      if (planFiles.length > 0) {
        setPhase("Lecture des plans…");
        const { rasterizePdfBudgeted } = await import("@/lib/pdf-render");
        const perFile = Math.floor(3_600_000 / planFiles.length);
        let skipped = 0;
        for (const f of planFiles) {
          const r = await rasterizePdfBudgeted(f, { budgetChars: perFile });
          planImages.push(...r.images);
          skipped += r.pagesSkipped;
        }
        if (skipped > 0) {
          toast.warning(`${skipped} page(s) de plan ignorée(s) (volumineux). Le CCTP reste basé sur les plans lus.`);
        }
      }

      setPhase(planImages.length ? "Analyse des plans + génération…" : "Génération…");
      const res = await fetch("/api/cctp/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lots: selected, projectType, context, planImages, deep }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSections(data.sections.map((s: Section) => ({ ...s, validated: false })));
      setOpen({ 0: true }); // première section dépliée par défaut
      setPlanContext(data.planContext ?? "");
      stopTimer(t0);
      toast.success(`${data.sections.length} section(s) générée(s) en ${fmtDuration(Math.round((Date.now() - t0) / 1000))}. Vérifiez puis validez.`);
    } catch (e) {
      stopTimer(t0);
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
      setPhase("");
    }
  }

  const allValidated = sections.length > 0 && sections.every((s) => s.validated);

  async function exportCctp(kind: "docx" | "pdf") {
    try {
      const fresh = await getCompany(true); // logo/cachet toujours à jour
      setCompany(fresh);
      const m = await import("@/lib/export-cctp");
      const data = sections.map((s) => ({ lot: s.lot, content: s.content }));
      const meta = { projectName, projectType, owner, architect, bet };
      if (kind === "docx") await m.exportCctpDocx(data, fresh as never, meta);
      else await m.exportCctpPdf(data, fresh as never, meta);
      toast.success("Export généré.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Cahier des charges"
        title="CCTP"
        accent="par lot"
        description="Sélectionnez les lots, générez un CCTP structuré, modifiez-le section par section, puis validez avant export."
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

            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Page de garde (officielle)</p>
              <div className="space-y-2">
                <Label>Nom du projet</Label>
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Ex : Immeuble collectif de 11 logements" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="space-y-2">
                <Label>Maître d’ouvrage</Label>
                <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Ex : OPH Ariège" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="space-y-2">
                <Label>Architecte / maîtrise d’œuvre</Label>
                <input value={architect} onChange={(e) => setArchitect(e.target.value)} placeholder="Cabinet d’architecture…" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="space-y-2">
                <Label>Bureau d’études techniques</Label>
                <input value={bet} onChange={(e) => setBet(e.target.value)} placeholder="BET structure / fluides…" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
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
              <PdfDropzone
                title="Glissez vos plans PDF ici ou cliquez"
                hint="Plans lus automatiquement pour adapter le CCTP"
                onFiles={(list) => setPlanFiles((p) => [...p, ...list])}
              />
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

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs">
              <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-gold-500" />
              <span>
                <span className="font-semibold text-navy-800">Mode exhaustif (CCTP DCE complet)</span>
                <span className="block text-muted-foreground">Plusieurs passes par lot pour un document long et détaillé. Génération plus longue.</span>
              </span>
            </label>

            <Button variant="gold" size="lg" className="w-full" disabled={busy} onClick={generate}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? `${phase || "Génération…"} ${fmtDuration(elapsed)}` : "Générer le CCTP"}
            </Button>

            {(busy || lastDuration !== null) && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Timer className="size-3.5 text-gold-600" />
                {busy
                  ? <span>Temps écoulé : <span className="font-mono font-semibold text-navy-800">{fmtDuration(elapsed)}</span></span>
                  : <span>Généré en <span className="font-mono font-semibold text-navy-800">{fmtDuration(lastDuration ?? 0)}</span></span>}
              </div>
            )}
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
                    <CardTitle className="text-sm text-navy-900">Synthèse des plans</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-navy-700">{planContext}</pre>
                  </CardContent>
                </Card>
              )}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {sections.filter((s) => s.validated).length}/{sections.length} section(s) validée(s)
                </p>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setAllOpen(true)}>
                    <ChevronsUpDown className="size-4" /> Tout déplier
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setAllOpen(false)}>
                    <ChevronsDownUp className="size-4" /> Tout replier
                  </Button>
                </div>
              </div>

              {sections.map((s, i) => {
                const isOpen = open[i] ?? false;
                return (
                  <Card key={i} className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleOpen(i)}
                      className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-muted/30"
                    >
                      <span className="flex items-center gap-2.5 font-semibold text-navy-900">
                        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                        {s.lot}
                      </span>
                      <span className="flex items-center gap-2">
                        {s.validated ? <Badge variant="success">Validé</Badge> : <Badge variant="warning">À valider</Badge>}
                      </span>
                    </button>
                    {isOpen && (
                      <CardContent className="space-y-3 border-t border-border/60 pt-4">
                        <Textarea
                          value={s.content ?? ""}
                          onChange={(e) => setSections((arr) => arr.map((x, j) => j === i ? { ...x, content: e.target.value, validated: false } : x))}
                          className="min-h-[260px] font-mono text-xs leading-relaxed"
                        />
                        <div className="flex justify-end">
                          <Button
                            variant={s.validated ? "outline" : "default"}
                            size="sm"
                            onClick={() => setSections((arr) => arr.map((x, j) => j === i ? { ...x, validated: !x.validated } : x))}
                          >
                            <ShieldCheck className="size-4" /> {s.validated ? "Dévalider" : "Valider la section"}
                          </Button>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}

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
