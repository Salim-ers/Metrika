"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LOTS_BTP, PROJECT_TYPES } from "@/lib/constants";
import { GENERATION_MODES, type GenerationMode, ACTOR_ROLES, type ActorEntry } from "@/lib/fidelity";
import { intervenantBlockingErrors } from "@/lib/blocking-errors";
import { validateCctpContent } from "@/lib/cctp-validate";
import { cn } from "@/lib/utils";
import { PdfDropzone } from "@/components/ui/pdf-dropzone";
import { getCompany } from "@/lib/client-data";
import { SaveToClient } from "@/components/clients/save-to-client";
import { Loader2, FileText, ShieldCheck, FileDown, Sparkles, X, ScanText, ChevronDown, ChevronsDownUp, ChevronsUpDown, Timer, ClipboardCheck, AlertTriangle, Users } from "lucide-react";

interface Section { lot: string; content: string; validated?: boolean }
interface ActorRow { role: string; value: string; source_file?: string; source_page?: string; confidence: string; status: string }
interface Preaudit {
  piecesUtilisees: string[]; piecesManquantes: string[]; donneesConfirmees: string[];
  donneesAConfirmer: string[]; contradictions: string[]; complementsMetrika: string[];
  pretPourGeneration: boolean; syntheseRisque: string;
}

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
  const [mode, setMode] = useState<GenerationMode>("fidele"); // fidèle marché par défaut
  const [elapsed, setElapsed] = useState(0); // chronomètre (secondes)
  const [lastDuration, setLastDuration] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // R1/R2/R7 — CCTP officiel pilote, table intervenants, pré-audit obligatoire
  const [officialCctpFiles, setOfficialCctpFiles] = useState<File[]>([]);
  const [officialCctpText, setOfficialCctpText] = useState("");
  const [actors, setActors] = useState<ActorRow[] | null>(null);
  const [intervenantsTable, setIntervenantsTable] = useState("");
  const [preaudit, setPreaudit] = useState<Preaudit | null>(null);
  const [prepared, setPrepared] = useState(false);
  const officialRef = useRef(""); // texte du CCTP officiel résolu (réutilisé par generate)
  const preparedRef = useRef(false);
  function invalidatePrep() {
    if (preparedRef.current) toast.info("Audit invalidé — relancez l’étape 1 après vos modifications.");
    preparedRef.current = false;
    setPrepared(false);
  }

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
    invalidatePrep();
  }

  const post = (payload: object) =>
    fetch("/api/cctp/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(async (r) => ({ ok: r.ok, d: await r.json() }));

  /** Plans PDF → images budgétées (lecture côté navigateur). */
  async function rasterizePlans(): Promise<{ data: string; mediaType: string }[]> {
    const out: { data: string; mediaType: string }[] = [];
    if (planFiles.length === 0) return out;
    setPhase("Lecture des plans…");
    const { rasterizePdfBudgeted } = await import("@/lib/pdf-render");
    const perFile = Math.floor(3_600_000 / planFiles.length);
    let skipped = 0;
    for (const f of planFiles) {
      const r = await rasterizePdfBudgeted(f, { budgetChars: perFile });
      out.push(...r.images);
      skipped += r.pagesSkipped;
    }
    if (skipped > 0) toast.warning(`${skipped} page(s) de plan ignorée(s) (volumineux).`);
    return out;
  }

  /** CCTP officiel (R1) : texte collé + extraction des PDF (avertit si illisible). */
  async function buildOfficialCctp(): Promise<string> {
    let txt = officialCctpText;
    if (officialCctpFiles.length > 0) {
      setPhase("Lecture du CCTP officiel…");
      const { extractPdfText } = await import("@/lib/pdf-render");
      for (const f of officialCctpFiles) {
        const t = await extractPdfText(f).catch(() => "");
        if (t && t.trim().length > 100) txt += `\n\n===== ${f.name} =====\n${t}`;
        else toast.warning(`CCTP officiel « ${f.name} » illisible (PDF scanné/protégé ?). Collez le texte.`);
      }
    }
    return txt.trim();
  }

  /** R7 — Audit préalable OBLIGATOIRE : plans + intervenants + rapport, avant génération. */
  async function prepare() {
    if (selected.length === 0) { toast.error("Sélectionnez au moins un lot."); return; }
    setBusy(true);
    setActors(null); setPreaudit(null); setPrepared(false); preparedRef.current = false;
    try {
      const planImages = await rasterizePlans();
      let planCtx = "";
      if (planImages.length) {
        setPhase("Analyse des plans…");
        const a = await post({ analyze: true, planImages });
        if (!a.ok) throw new Error(a.d?.error || "Analyse des plans impossible.");
        planCtx = a.d?.planContext ?? "";
      }
      setPlanContext(planCtx);

      const official = await buildOfficialCctp();
      officialRef.current = official;

      setPhase("Table des intervenants…");
      const iv = await post({ intervenants: true, officialCctp: official, planContext: planCtx });
      if (iv.ok && Array.isArray(iv.d?.actors)) {
        // On ne garde que les rôles valides (défense contre une réponse dégradée).
        const valid = (iv.d.actors as ActorRow[]).filter((a) => a && typeof a.role === "string" && a.role in ACTOR_ROLES);
        setActors(valid);
        setIntervenantsTable(typeof iv.d.intervenantsTable === "string" ? iv.d.intervenantsTable : "");
      }

      setPhase("Rapport d'audit préalable…");
      const pa = await post({ preaudit: true, lots: selected, projectType, officialCctp: official, planContext: planCtx, context });
      const pre = pa.d?.preaudit;
      if (!pa.ok || !pre || typeof pre !== "object") throw new Error(pa.d?.error || "Audit préalable impossible.");
      setPreaudit(pre as Preaudit);
      setPrepared(true); preparedRef.current = true;
      toast.success("Audit préalable prêt. Vérifiez intervenants et écarts, puis générez le CCTP.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false); setPhase("");
    }
  }
  function toggleOpen(i: number) {
    setOpen((o) => ({ ...o, [i]: !o[i] }));
  }
  function setAllOpen(value: boolean) {
    setOpen(Object.fromEntries(sections.map((_, i) => [i, value])));
  }

  function updateActor(i: number, patch: Partial<ActorRow>) {
    setActors((arr) => (arr ? arr.map((a, j) => (j === i ? { ...a, ...patch } : a)) : arr));
  }

  /** Table intervenants (corrigée par l'utilisateur) en texte injectable au prompt. */
  function actorsToPromptTable(rows: ActorRow[]): string {
    const lines = rows.map((a) => {
      const label = ACTOR_ROLES[a.role as keyof typeof ACTOR_ROLES]?.label ?? a.role;
      const src = [a.source_file, a.source_page ? `p.${a.source_page}` : ""].filter(Boolean).join(" ");
      return `- ${label} : ${a.value}${src ? ` (source : ${src})` : ""} [${a.status}]`;
    });
    return `TABLE DES INTERVENANTS (à reprendre EXACTEMENT, sans réinterprétation) :\n${lines.join("\n")}`;
  }

  async function generate(override = false) {
    if (selected.length === 0) { toast.error("Sélectionnez au moins un lot."); return; }
    if (!prepared) { toast.error("Lancez d'abord l'audit préalable (étape obligatoire)."); return; }
    if (actorErrors.length > 0) { toast.error("Levez les erreurs d'intervenants (rôle déduit / ambigu) avant de générer."); return; }
    if (preaudit && preaudit.pretPourGeneration === false && !override) {
      toast.error("L'audit ne recommande pas la génération. Corrigez les points ou utilisez « Générer malgré l'audit »."); return;
    }
    setBusy(true);
    setSections([]);
    const t0 = startTimer();
    try {
      const planCtx = planContext;
      const official = officialRef.current;
      // Table intervenants telle que corrigée dans l'UI (sinon celle du serveur).
      const ivTable = actors && actors.length ? actorsToPromptTable(actors) : intervenantsTable;

      // Génération lot par lot ; passes séquentielles avec ajout progressif.
      // Chaque passe reçoit le CCTP officiel (pilote) + la table des intervenants.
      const built: Section[] = [];
      let anyFail = false;
      for (let li = 0; li < selected.length; li++) {
        const lot = selected[li];
        built.push({ lot, content: "", validated: false });
        const idx = built.length - 1;
        if (idx === 0) setOpen({ 0: true });
        setSections([...built]);
        const parts: string[] = [];
        let pc = deep ? 0 : 1; // 0 = inconnu jusqu'à la 1re réponse
        let pi = 0;
        do {
          setPhase(`${lot} (${li + 1}/${selected.length})${pc > 1 ? ` — partie ${pi + 1}/${pc}` : deep ? ` — partie ${pi + 1}` : ""}…`);
          const { ok, d } = await post({ lot, projectType, context, planContext: planCtx, deep, passIndex: pi, mode, officialCctp: official, intervenantsTable: ivTable });
          if (typeof d?.passCount === "number" && d.passCount > 0) pc = d.passCount;
          if (pc === 0) pc = 1;
          if (ok && d?.content) parts.push(d.content as string);
          else { anyFail = true; parts.push(`## Partie ${pi + 1} — à régénérer\n\n${(d && d.error) || "Échec de génération."}`); }
          built[idx] = { ...built[idx], content: parts.join("\n\n") };
          setSections([...built]);
          pi++;
        } while (pi < pc && pi < 8);
      }
      if (built.length === 0) throw new Error("Aucune section générée.");
      stopTimer(t0);
      toast.success(`${built.length} section(s) générée(s) en ${fmtDuration(Math.round((Date.now() - t0) / 1000))}.${anyFail ? " Certaines parties sont à régénérer." : ""}`);
    } catch (e) {
      stopTimer(t0);
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
      setPhase("");
    }
  }

  const allValidated = sections.length > 0 && sections.every((s) => s.validated);
  const actorErrors = actors ? intervenantBlockingErrors(actors as unknown as ActorEntry[]) : [];
  const STATUS_FR: Record<string, string> = { confirmed: "Confirmé", inferred: "Déduit", missing: "Absent" };
  const STATUS_HINT: Record<string, string> = {
    confirmed: "Extrait d'une source (pièce / plan / cartouche).",
    inferred: "Rôle déduit par l'IA — À CONFIRMER ou corriger (corps non fiable tant que déduit).",
    missing: "Non renseigné dans les pièces fournies (optionnel selon le projet).",
  };
  // Garde-fou CCTP côté code : écarts de fidélité du texte généré (R3/R5/R6).
  const cctpIssues = useMemo(
    () => (sections.length ? validateCctpContent(sections.map((s) => s.content).join("\n\n"), { mode, officialCctp: officialRef.current }) : []),
    [sections, mode],
  );
  // Les contrôles CCTP sont des ALERTES (non bloquantes) : l'export est gardé par
  // la validation humaine des sections, pas par des heuristiques sur du texte libre.
  const auditReady = !preaudit || preaudit.pretPourGeneration !== false;
  const canGenerate = prepared && actorErrors.length === 0 && auditReady;
  const canExportCctp = allValidated;

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

  // PDF CCTP sans téléchargement (pour enregistrement dans une fiche client).
  async function buildCctpBytes() {
    const fresh = await getCompany(true);
    const m = await import("@/lib/export-cctp");
    const data = sections.map((s) => ({ lot: s.lot, content: s.content }));
    const meta = { projectName, projectType, owner, architect, bet };
    return m.exportCctpPdf(data, fresh as never, meta, { download: false });
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
                onChange={(e) => { setProjectType(e.target.value); invalidatePrep(); }}
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

            <div className="space-y-2 rounded-lg border border-navy-100 bg-navy-50/30 p-3">
              <Label className="flex items-center gap-1.5 text-navy-800"><FileText className="size-3.5 text-navy-600" /> CCTP officiel (optionnel)</Label>
              <p className="text-[11px] leading-relaxed text-muted-foreground">S’il est fourni, il <strong>pilote</strong> le contenu généré (structure, prescriptions, normes). Les plans ne servent qu’à compléter/vérifier.</p>
              <PdfDropzone
                title="Glissez le CCTP officiel (PDF)"
                hint="Pilote le document"
                onFiles={(list) => { setOfficialCctpFiles((p) => [...p, ...list]); invalidatePrep(); }}
              />
              {officialCctpFiles.length > 0 && (
                <ul className="space-y-1.5">
                  {officialCctpFiles.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-navy-800">{f.name}</span>
                      <button onClick={() => { setOfficialCctpFiles((p) => p.filter((_, j) => j !== i)); invalidatePrep(); }} className="text-destructive hover:opacity-70"><X className="size-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <Textarea value={officialCctpText} onChange={(e) => { setOfficialCctpText(e.target.value); invalidatePrep(); }} className="min-h-[70px] text-xs" placeholder="…ou collez le texte du CCTP officiel" />
            </div>

            <div className="space-y-2">
              <Label>Plans du projet (PDF, optionnel)</Label>
              <PdfDropzone
                title="Glissez vos plans PDF ici ou cliquez"
                hint="Plans lus automatiquement pour adapter le CCTP"
                onFiles={(list) => { setPlanFiles((p) => [...p, ...list]); invalidatePrep(); }}
              />
              {planFiles.length > 0 && (
                <ul className="space-y-1.5">
                  {planFiles.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-navy-800">{f.name}</span>
                      <button onClick={() => { setPlanFiles((p) => p.filter((_, j) => j !== i)); invalidatePrep(); }} className="text-destructive hover:opacity-70">
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <Label>Exigences particulières (optionnel)</Label>
              <Textarea value={context} onChange={(e) => { setContext(e.target.value); invalidatePrep(); }} placeholder="Contraintes du projet, normes spécifiques, niveau de finition…" />
            </div>

            <div className="space-y-2">
              <Label>Mode de rédaction</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["fidele", "enrichi"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                      mode === m ? "border-gold-500 bg-gold-50/60 ring-1 ring-gold-400" : "border-border bg-card hover:border-gold-300"
                    )}
                  >
                    <span className="block font-semibold text-navy-800">{GENERATION_MODES[m].label}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{GENERATION_MODES[mode].description}</p>
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs">
              <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-gold-500" />
              <span>
                <span className="font-semibold text-navy-800">Mode exhaustif (CCTP DCE complet)</span>
                <span className="block text-muted-foreground">Plusieurs passes par lot pour un document long et détaillé. Génération plus longue.</span>
              </span>
            </label>

            <div className="space-y-2">
              <Button variant={prepared ? "outline" : "gold"} size="lg" className="w-full" disabled={busy} onClick={() => prepare()}>
                {busy && !prepared ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
                {busy && !prepared ? (phase || "Préparation…") : prepared ? "1. Refaire l'audit préalable" : "1. Préparer & auditer (obligatoire)"}
              </Button>
              <Button variant="gold" size="lg" className="w-full" disabled={busy || !canGenerate} onClick={() => generate()}>
                {busy && prepared ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {busy && prepared ? `${phase || "Génération…"} ${fmtDuration(elapsed)}` : "2. Générer le CCTP"}
              </Button>
              {!prepared && <p className="text-[11px] text-muted-foreground">L’audit préalable (pièces, intervenants, écarts) est obligatoire avant la génération.</p>}
              {prepared && actorErrors.length > 0 && <p className="text-[11px] font-medium text-destructive">Génération bloquée : levez les {actorErrors.length} erreur(s) d’intervenants (table à droite).</p>}
              {prepared && actorErrors.length === 0 && !auditReady && (
                <>
                  <p className="text-[11px] font-medium text-warning-foreground">L’audit ne recommande pas la génération (pièces manquantes / contradictions).</p>
                  <Button variant="outline" size="sm" className="w-full" disabled={busy} onClick={() => generate(true)}>Générer malgré l’audit (sous ma responsabilité)</Button>
                </>
              )}
            </div>

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
          {/* R7 — Rapport d'audit préalable (obligatoire avant génération) */}
          {preaudit && (
            <Card className="border-navy-100">
              <CardHeader className="flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-navy-900"><ClipboardCheck className="size-4 text-navy-600" /> Audit préalable</CardTitle>
                <Badge variant={preaudit.pretPourGeneration ? "success" : "warning"}>{preaudit.pretPourGeneration ? "Prêt pour génération" : "Vérifications requises"}</Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {preaudit.syntheseRisque && <p className="text-navy-800">{preaudit.syntheseRisque}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ["Pièces utilisées", preaudit.piecesUtilisees, "text-navy-700"],
                    ["Pièces manquantes", preaudit.piecesManquantes, "text-warning-foreground"],
                    ["Données confirmées", preaudit.donneesConfirmees, "text-success"],
                    ["Données à confirmer", preaudit.donneesAConfirmer, "text-gold-700"],
                    ["Contradictions à arbitrer", preaudit.contradictions, "text-destructive"],
                    ["Compléments Metrika (à valider)", preaudit.complementsMetrika, "text-gold-700"],
                  ] as const).map(([title, items, color]) => (
                    items && items.length > 0 ? (
                      <div key={title}>
                        <p className={cn("mb-1 font-semibold uppercase tracking-wide", color)}>{title}</p>
                        <ul className="list-disc space-y-0.5 pl-4 text-navy-700">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
                      </div>
                    ) : null
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* R2 — Table unique des intervenants */}
          {actors && actors.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-navy-900"><Users className="size-4 text-navy-600" /> Intervenants du projet</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {actorErrors.length > 0 && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-navy-800">
                    <p className="flex items-center gap-1.5 font-semibold text-destructive"><AlertTriangle className="size-3.5" /> {actorErrors.length} point(s) à lever (rôle déduit / ambigu) — génération bloquée</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">{actorErrors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
                    <p className="mt-1.5 text-muted-foreground">Corrigez l’intervenant ci-dessous (saisissez l’identité réelle puis passez le statut à « Confirmé », ou « Absent » si non fourni).</p>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b text-left uppercase tracking-wider text-muted-foreground"><th className="pb-1.5 pr-2">Rôle</th><th className="pb-1.5 px-2">Intervenant (éditable)</th><th className="pb-1.5 px-2">Source</th><th className="pb-1.5 pl-2">Statut</th></tr></thead>
                    <tbody>
                      {actors.map((a, i) => (
                        <tr key={i} className="border-b border-border/60 align-top">
                          <td className="py-1.5 pr-2 font-medium text-navy-800">{ACTOR_ROLES[a.role as keyof typeof ACTOR_ROLES]?.label ?? a.role}</td>
                          <td className="px-2 py-1.5">
                            <input
                              value={a.value}
                              onChange={(e) => updateActor(i, { value: e.target.value })}
                              className="w-full rounded border border-input bg-card px-1.5 py-1 text-navy-800"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground">{[a.source_file, a.source_page ? `p.${a.source_page}` : ""].filter(Boolean).join(" ") || "—"}</td>
                          <td className="pl-2 py-1.5">
                            <select
                              value={a.status}
                              title={STATUS_HINT[a.status]}
                              onChange={(e) => updateActor(i, { status: e.target.value })}
                              className={cn("rounded border border-input bg-card px-1.5 py-1 text-xs",
                                a.status === "confirmed" ? "text-success" : a.status === "inferred" ? "text-warning-foreground" : "text-muted-foreground")}
                            >
                              {(["confirmed", "inferred", "missing"] as const).map((s) => <option key={s} value={s}>{STATUS_FR[s]}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {sections.length === 0 ? (
            <Card className="flex h-full min-h-[260px] items-center justify-center border-dashed">
              <div className="text-center">
                <FileText className="mx-auto size-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">{prepared ? "Audit prêt. Cliquez « 2. Générer le CCTP »." : "Le CCTP généré apparaîtra ici, section par section."}</p>
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

              {/* Contrôles de fidélité du texte généré (R3/R5/R6) — ALERTES non bloquantes */}
              {cctpIssues.length > 0 && (
                <Card className="border-warning/40 bg-warning/5">
                  <CardHeader><CardTitle className="flex items-center gap-2 text-navy-900"><ShieldCheck className="size-4" /> Contrôles de fidélité — {cctpIssues.length} point(s) à vérifier</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5 text-xs text-navy-800">
                    <p className="text-muted-foreground">Alertes (non bloquantes) — vérifiez puis validez les sections. L’export reste possible.</p>
                    <ul className="max-h-48 list-disc space-y-1 overflow-auto pl-4">
                      {cctpIssues.slice(0, 20).map((it, i) => (
                        <li key={i}>
                          <span className="text-warning-foreground">Alerte :</span> {it.message}
                          {it.excerpt ? <span className="block truncate text-[11px] italic text-muted-foreground">« {it.excerpt} »</span> : null}
                        </li>
                      ))}
                      {cctpIssues.length > 20 ? <li className="text-muted-foreground">… +{cctpIssues.length - 20} autre(s)</li> : null}
                    </ul>
                  </CardContent>
                </Card>
              )}

              <Card className="border-gold-200 bg-gold-50/40">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <p className="text-sm text-navy-800">
                    {!allValidated
                      ? "Validez toutes les sections pour débloquer l’export final."
                      : "Toutes les sections sont validées. Vous pouvez exporter le document officiel."}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {canExportCctp && (
                      <SaveToClient category="CCTP" filename="cctp-metrika.pdf" build={buildCctpBytes} />
                    )}
                    <Button variant="outline" disabled={!canExportCctp} onClick={() => exportCctp("docx")}>
                      <FileDown className="size-4" /> DOCX
                    </Button>
                    <Button variant="gold" disabled={!canExportCctp} onClick={() => exportCctp("pdf")}>
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
