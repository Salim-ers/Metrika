"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Stepper } from "@/components/ui/stepper";
import { AccordionItem } from "@/components/ui/accordion";
import { EmptyState } from "@/components/ui/empty-state";
import { QualityPanel, type QualityGroup } from "@/components/quality/quality-panel";
import { CctpPreview } from "@/components/document/cctp-preview";
import { PdfDropzone } from "@/components/ui/pdf-dropzone";
import { SaveToClient } from "@/components/clients/save-to-client";
import { LOTS_BTP, PROJECT_TYPES, JURISDICTIONS } from "@/lib/constants";
import { GENERATION_MODES, type GenerationMode, ACTOR_ROLES, type ActorEntry } from "@/lib/fidelity";
import { intervenantBlockingErrors } from "@/lib/blocking-errors";
import { validateCctpContent, extractVerifyRegister, VERIFY_KIND_LABELS, type VerifyPointKind } from "@/lib/cctp-validate";
import { getCompany, getConfiguredRefs, recordExportClient } from "@/lib/client-data";
import { useProject } from "@/lib/use-project";
import { cn } from "@/lib/utils";
import {
  Loader2, FileText, ShieldCheck, FileDown, Sparkles, X, ScanText, Timer,
  ClipboardCheck, AlertTriangle, Users, Save, Table2, ArrowRight, Eye, PencilLine,
  ChevronsDownUp, ChevronsUpDown, FolderKanban,
} from "lucide-react";

interface Section { lot: string; content: string; validated?: boolean }
interface ActorRow { role: string; value: string; source_file?: string; source_page?: string; confidence: string; status: string }
interface Preaudit {
  piecesUtilisees: string[]; piecesManquantes: string[]; donneesConfirmees: string[];
  donneesAConfirmer: string[]; contradictions: string[]; complementsMetrika: string[];
  pretPourGeneration: boolean; syntheseRisque: string;
}

function fmtDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const STEPS = [
  { key: "pieces", label: "Pièces & paramètres", description: "Projet, lots, sources" },
  { key: "audit", label: "Audit préalable", description: "Intervenants & écarts" },
  { key: "generation", label: "Génération & relecture", description: "Validation par section" },
  { key: "export", label: "Export & chaînage", description: "PDF · DOCX · DPGF" },
] as const;

export default function CctpPage() {
  return (
    <Suspense>
      <CctpInner />
    </Suspense>
  );
}

function CctpInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { project: activeProject } = useProject();

  // ── Paramètres du document ──
  const [selected, setSelected] = useState<string[]>([]);
  const [projectType, setProjectType] = useState<string>(PROJECT_TYPES[0]);
  const [projectName, setProjectName] = useState("");
  const [owner, setOwner] = useState("");
  const [architect, setArchitect] = useState("");
  const [bet, setBet] = useState("");
  const [context, setContext] = useState("");
  const [jurisdiction, setJurisdiction] = useState<string>("Maroc");
  const [mode, setMode] = useState<GenerationMode>("fidele");
  const [deep, setDeep] = useState(true);

  // ── Rattachement projet / document sauvegardé ──
  const [projectId, setProjectId] = useState<string | null>(null);
  const [cctpId, setCctpId] = useState<string | null>(null);
  const [docStatus, setDocStatus] = useState<string>("DRAFT");
  const [docVersion, setDocVersion] = useState(1);
  const [docIndice, setDocIndice] = useState("A");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // ── Pièces sources ──
  const [planFiles, setPlanFiles] = useState<File[]>([]);
  const [planContext, setPlanContext] = useState("");
  const [officialCctpFiles, setOfficialCctpFiles] = useState<File[]>([]);
  const [officialCctpText, setOfficialCctpText] = useState("");

  // ── Audit / génération ──
  const [sections, setSections] = useState<Section[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [elapsed, setElapsed] = useState(0);
  const [lastDuration, setLastDuration] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [actors, setActors] = useState<ActorRow[] | null>(null);
  const [intervenantsTable, setIntervenantsTable] = useState("");
  const [preaudit, setPreaudit] = useState<Preaudit | null>(null);
  const [prepared, setPrepared] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const officialRef = useRef("");
  const preparedRef = useRef(false);
  const configuredRefsRef = useRef("");

  // ── Initialisation : projet actif / query params / document existant ──
  useEffect(() => { getCompany().then(setCompany); }, []);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  useEffect(() => {
    const qProject = search.get("projectId");
    const pid = qProject || activeProject?.id || null;
    setProjectId(pid);
    if (activeProject && (!qProject || qProject === activeProject.id)) {
      setJurisdiction(activeProject.jurisdiction || "Maroc");
      if (activeProject.type) setProjectType(activeProject.type);
      if (!projectName) setProjectName(activeProject.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeProject?.id]);

  // Chargement d'un CCTP sauvegardé (?id=…)
  const loadedIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = search.get("id");
    if (!id || loadedIdRef.current === id) return;
    loadedIdRef.current = id;
    fetch(`/api/cctp/documents/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.cctp) { toast.error(d.error ?? "CCTP introuvable."); return; }
        const c = d.cctp;
        setCctpId(c.id);
        setDocStatus(c.status);
        setDocVersion(c.version);
        setDocIndice(c.indice);
        setProjectId(c.projectId ?? null);
        setJurisdiction(c.jurisdiction ?? "Maroc");
        setMode(c.mode === "enrichi" ? "enrichi" : "fidele");
        if (c.projectType) setProjectType(c.projectType);
        setPlanContext(c.planContext ?? "");
        const meta = c.meta ? JSON.parse(c.meta) : {};
        setProjectName(meta.projectName ?? "");
        setOwner(meta.owner ?? "");
        setArchitect(meta.architect ?? "");
        setBet(meta.bet ?? "");
        const secs = (c.sections ?? []).map((s: { lot: string; content: string; validated: boolean }) => ({
          lot: s.lot, content: s.content, validated: s.validated,
        }));
        setSections(secs);
        setSelected(secs.map((s: Section) => s.lot));
        if (c.project?.actors?.length) {
          setActors(c.project.actors.map((a: ActorRow & { sourceFile?: string; sourcePage?: string }) => ({
            role: a.role, value: a.value, source_file: a.sourceFile ?? undefined,
            source_page: a.sourcePage ?? undefined, confidence: a.confidence, status: a.status,
          })));
        }
        setOpen({ 0: true });
        setDirty(false);
        toast.success(`CCTP « ${c.title} » chargé (v${c.version}-${c.indice}).`);
      })
      .catch(() => toast.error("Chargement du CCTP impossible."));
  }, [search]);

  function invalidatePrep() {
    if (preparedRef.current) toast.info("Audit invalidé — relancez l’étape d’audit après vos modifications.");
    preparedRef.current = false;
    setPrepared(false);
  }

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

  function toggleLot(lot: string) {
    setSelected((s) => (s.includes(lot) ? s.filter((l) => l !== lot) : [...s, lot]));
    invalidatePrep();
  }

  const post = (payload: object) =>
    fetch("/api/cctp/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(async (r) => ({ ok: r.ok, d: await r.json() }));

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

  /** Étape 2 — Audit préalable OBLIGATOIRE (plans + intervenants + rapport). */
  async function prepare() {
    if (selected.length === 0) { toast.error("Sélectionnez au moins un lot."); return; }
    setBusy(true);
    setActors(null); setPreaudit(null); setPrepared(false); preparedRef.current = false;
    try {
      configuredRefsRef.current = await getConfiguredRefs(jurisdiction, selected);
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

  function toggleOpen(i: number) { setOpen((o) => ({ ...o, [i]: !o[i] })); }
  function setAllOpen(value: boolean) { setOpen(Object.fromEntries(sections.map((_, i) => [i, value]))); }
  function updateActor(i: number, patch: Partial<ActorRow>) {
    setActors((arr) => (arr ? arr.map((a, j) => (j === i ? { ...a, ...patch } : a)) : arr));
  }

  function actorsToPromptTable(rows: ActorRow[]): string {
    const lines = rows.map((a) => {
      const label = ACTOR_ROLES[a.role as keyof typeof ACTOR_ROLES]?.label ?? a.role;
      const src = [a.source_file, a.source_page ? `p.${a.source_page}` : ""].filter(Boolean).join(" ");
      return `- ${label} : ${a.value}${src ? ` (source : ${src})` : ""} [${a.status}]`;
    });
    return `TABLE DES INTERVENANTS (à reprendre EXACTEMENT, sans réinterprétation) :\n${lines.join("\n")}`;
  }

  /** Étape 3 — Génération lot par lot (passes séquentielles). */
  async function generate(override = false) {
    if (selected.length === 0) { toast.error("Sélectionnez au moins un lot."); return; }
    if (!prepared) { toast.error("Lancez d'abord l'audit préalable (étape obligatoire)."); return; }
    if (actorErrors.length > 0) { toast.error("Levez les erreurs d'intervenants (rôle déduit / ambigu) avant de générer."); return; }
    if (preaudit && preaudit.pretPourGeneration === false && !override) {
      toast.error("L'audit ne recommande pas la génération. Corrigez les points ou utilisez « Générer malgré l'audit »."); return;
    }
    setBusy(true);
    setSections([]);
    setCctpId(null); // nouvelle génération = nouveau document
    setDocStatus("DRAFT"); setDocVersion(1); setDocIndice("A");
    const t0 = startTimer();
    try {
      const planCtx = planContext;
      const official = officialRef.current;
      const ivTable = actors && actors.length ? actorsToPromptTable(actors) : intervenantsTable;

      const built: Section[] = [];
      let anyFail = false;
      for (let li = 0; li < selected.length; li++) {
        const lot = selected[li];
        built.push({ lot, content: "", validated: false });
        const idx = built.length - 1;
        if (idx === 0) setOpen({ 0: true });
        setSections([...built]);
        const parts: string[] = [];
        let pc = deep ? 0 : 1;
        let pi = 0;
        do {
          setPhase(`${lot} (${li + 1}/${selected.length})${pc > 1 ? ` — partie ${pi + 1}/${pc}` : deep ? ` — partie ${pi + 1}` : ""}…`);
          const { ok, d } = await post({
            lot, projectType, context, planContext: planCtx, deep, passIndex: pi, mode,
            jurisdiction, configuredRefs: configuredRefsRef.current,
            officialCctp: official, intervenantsTable: ivTable,
          });
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
      // Sauvegarde automatique du brouillon (traçabilité + chaînage DPGF).
      await saveCctp(built, { silent: false });
    } catch (e) {
      stopTimer(t0);
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
      setPhase("");
    }
  }

  /** Registre des points à vérifier → issues persistées. */
  function buildIssues(secs: Section[]) {
    const register = extractVerifyRegister(secs);
    const kindMap: Record<VerifyPointKind, { severity: "majeur" | "mineur"; kind: "missing_data" | "hypothesis" | "inconsistency" | "to_validate" }> = {
      conflit: { severity: "majeur", kind: "inconsistency" },
      localisation: { severity: "mineur", kind: "missing_data" },
      a_metrer: { severity: "mineur", kind: "missing_data" },
      non_renseigne: { severity: "mineur", kind: "missing_data" },
      complement: { severity: "mineur", kind: "hypothesis" },
      a_confirmer: { severity: "mineur", kind: "to_validate" },
    };
    return register.slice(0, 300).map((p) => ({
      ...kindMap[p.kind],
      message: `[${p.lot}${p.chapter ? ` · ${p.chapter}` : ""}] ${p.excerpt}`,
    }));
  }

  /** Sauvegarde (création ou mise à jour) du document CCTP. */
  async function saveCctp(secs?: Section[], opts?: { silent?: boolean }) {
    const data = secs ?? sections;
    if (data.length === 0) { toast.error("Rien à sauvegarder."); return; }
    setSaving(true);
    try {
      const meta = { projectName, projectType, owner, architect, bet };
      const title = projectName
        ? `CCTP — ${projectName}${data.length === 1 ? ` — ${data[0].lot}` : ""}`
        : `CCTP — ${data.map((s) => s.lot).join(", ").slice(0, 120)}`;
      if (!cctpId) {
        const res = await fetch("/api/cctp/documents", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title, projectId, projectType, mode, jurisdiction, meta,
            planContext, sections: data, actors, issues: buildIssues(data),
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setCctpId(d.cctp.id);
        setDocStatus(d.cctp.status);
        setDocVersion(d.cctp.version);
        setDocIndice(d.cctp.indice);
        if (!opts?.silent) toast.success("CCTP sauvegardé — retrouvez-le dans le projet.");
      } else {
        const res = await fetch(`/api/cctp/documents/${cctpId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, meta, sections: data }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setDocStatus(d.cctp.status);
        if (!opts?.silent) toast.success("Modifications enregistrées.");
      }
      setDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sauvegarde impossible.");
    } finally {
      setSaving(false);
    }
  }

  // ── Dérivés ──
  const allValidated = sections.length > 0 && sections.every((s) => s.validated);
  const actorErrors = actors ? intervenantBlockingErrors(actors as unknown as ActorEntry[]) : [];
  const cctpIssues = useMemo(
    () => (sections.length ? validateCctpContent(sections.map((s) => s.content).join("\n\n"), { mode, officialCctp: officialRef.current }) : []),
    [sections, mode],
  );
  const verifyRegister = useMemo(() => extractVerifyRegister(sections), [sections]);
  const auditReady = !preaudit || preaudit.pretPourGeneration !== false;
  const canGenerate = prepared && actorErrors.length === 0 && auditReady;
  const canExportCctp = allValidated;
  const locked = docStatus === "VALIDATED";

  const currentStep: (typeof STEPS)[number]["key"] =
    sections.length > 0 ? (canExportCctp ? "export" : "generation") : prepared ? "audit" : "pieces";
  const doneSteps = [
    ...(prepared || sections.length > 0 ? ["pieces"] : []),
    ...(sections.length > 0 ? ["audit"] : []),
    ...(canExportCctp ? ["generation"] : []),
  ];

  const qualityGroups: QualityGroup[] = useMemo(() => {
    const byKind = (kinds: VerifyPointKind[]) =>
      verifyRegister.filter((p) => kinds.includes(p.kind)).map((p) => ({
        message: `${p.lot}${p.chapter ? ` · ${p.chapter}` : ""}`,
        detail: p.excerpt,
      }));
    return [
      { key: "conflicts", label: "Incohérences / contradictions", tone: "destructive", items: byKind(["conflit"]) },
      { key: "missing", label: "Données manquantes (à métrer / non renseignées / localisation)", tone: "warning", items: byKind(["a_metrer", "non_renseigne", "localisation"]) },
      { key: "tovalidate", label: "À confirmer", tone: "warning", items: byKind(["a_confirmer"]) },
      { key: "hypotheses", label: "Hypothèses & compléments Metrika (non contractuels)", tone: "gold", items: byKind(["complement"]) },
      {
        key: "fidelity", label: "Contrôles de fidélité du texte", tone: "muted",
        items: cctpIssues.map((i) => ({ message: i.message, detail: i.excerpt })),
      },
    ];
  }, [verifyRegister, cctpIssues]);

  // ── Exports ──
  async function exportCctp(kind: "docx" | "pdf") {
    try {
      const fresh = await getCompany(true);
      setCompany(fresh);
      const m = await import("@/lib/export-cctp");
      const data = sections.map((s) => ({ lot: s.lot, content: s.content }));
      const meta = {
        projectName, projectType, owner, architect, bet,
        jurisdiction, indice: docIndice, version: docVersion,
        actors: actors ?? undefined,
        verifyRegister,
      };
      const filename = `cctp-${(projectName || "metrika").toLowerCase().replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.${kind}`;
      if (kind === "docx") await m.exportCctpDocx(data, fresh as never, meta);
      else await m.exportCctpPdf(data, fresh as never, meta);
      recordExportClient({ docType: "CCTP", format: kind === "pdf" ? "PDF" : "DOCX", filename, docId: cctpId, projectId });
      toast.success("Export généré.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    }
  }

  async function buildCctpBytes() {
    const fresh = await getCompany(true);
    const m = await import("@/lib/export-cctp");
    const data = sections.map((s) => ({ lot: s.lot, content: s.content }));
    const meta = { projectName, projectType, owner, architect, bet, jurisdiction, indice: docIndice, version: docVersion, actors: actors ?? undefined, verifyRegister };
    return m.exportCctpPdf(data, fresh as never, meta, { download: false });
  }

  function goToDpgf() {
    if (!cctpId) { toast.error("Sauvegardez d'abord le CCTP."); return; }
    router.push(`/agents/dpgf?cctpId=${cctpId}`);
  }

  const previewActors = (actors ?? []).map((a) => ({ role: a.role, value: a.value, status: a.status }));
  const inputCls = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Agent documentaire"
        title="CCTP"
        accent="général & par lot"
        description="Pièces sources → audit préalable → génération tracée → validation section par section → export. Aucune donnée inventée : ce qui manque est marqué « À confirmer »."
      />

      {/* Contexte document */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {projectId ? (
          <Badge variant="default" className="gap-1.5">
            <FolderKanban className="size-3" /> {activeProject?.id === projectId ? activeProject.name : "Projet lié"}
          </Badge>
        ) : (
          <Badge variant="muted" title="Sans projet : le document ne sera pas chaîné au dossier">Sans projet</Badge>
        )}
        <Badge variant="gold">{jurisdiction}</Badge>
        {cctpId ? (
          <>
            <Badge variant="outline" className="tabular-nums">v{docVersion} · indice {docIndice}</Badge>
            <StatusBadge status={docStatus} />
          </>
        ) : sections.length > 0 ? (
          <Badge variant="warning">Non sauvegardé</Badge>
        ) : null}
        {dirty && cctpId ? <Badge variant="warning">Modifications non enregistrées</Badge> : null}
        <div className="ml-auto">
          <Stepper
            steps={[...STEPS]}
            current={currentStep}
            done={doneSteps}
            className="hidden md:flex"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* ══ Colonne paramètres (étape 1) ══ */}
        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-navy-900">1 · Pièces & paramètres</CardTitle>
            {locked && <Badge variant="success">Verrouillé</Badge>}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type de projet</Label>
                <select value={projectType} onChange={(e) => { setProjectType(e.target.value); invalidatePrep(); }} className={inputCls}>
                  {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Juridiction</Label>
                <select value={jurisdiction} onChange={(e) => { setJurisdiction(e.target.value); invalidatePrep(); }} className={inputCls}>
                  {JURISDICTIONS.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
                </select>
                <p className="text-[11px] text-muted-foreground">{JURISDICTIONS.find((j) => j.value === jurisdiction)?.refs}</p>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Page de garde (officielle)</p>
              <div className="space-y-2">
                <Label>Nom du projet</Label>
                <input value={projectName} onChange={(e) => { setProjectName(e.target.value); setDirty(true); }} placeholder="Ex : Immeuble collectif de 11 logements" className={inputCls} />
              </div>
              <div className="space-y-2">
                <Label>Maître d’ouvrage</Label>
                <input value={owner} onChange={(e) => { setOwner(e.target.value); setDirty(true); }} placeholder="Ex : OPH Ariège" className={inputCls} />
              </div>
              <div className="space-y-2">
                <Label>Architecte / maîtrise d’œuvre</Label>
                <input value={architect} onChange={(e) => { setArchitect(e.target.value); setDirty(true); }} placeholder="Cabinet d’architecture…" className={inputCls} />
              </div>
              <div className="space-y-2">
                <Label>Bureau d’études techniques</Label>
                <input value={bet} onChange={(e) => { setBet(e.target.value); setDirty(true); }} placeholder="BET structure / fluides…" className={inputCls} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Lots à inclure ({selected.length})</Label>
              <div className="flex flex-wrap gap-2">
                {LOTS_BTP.map((lot) => (
                  <button
                    key={lot}
                    onClick={() => toggleLot(lot)}
                    disabled={locked}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      selected.includes(lot)
                        ? "border-gold-500 bg-gold-500 text-navy-900"
                        : "border-border bg-card text-navy-700 hover:border-gold-400",
                      locked && "cursor-not-allowed opacity-50",
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
                <span className="block text-muted-foreground">Plusieurs passes par lot suivant le plan type 15 chapitres. Vise un document DCE complet quand les pièces le permettent — sans jamais remplir artificiellement.</span>
              </span>
            </label>

            <div className="space-y-2">
              <Button variant={prepared ? "outline" : "gold"} size="lg" className="w-full" disabled={busy} onClick={() => prepare()}>
                {busy && !prepared ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
                {busy && !prepared ? (phase || "Préparation…") : prepared ? "2 · Refaire l'audit préalable" : "2 · Préparer & auditer (obligatoire)"}
              </Button>
              <Button variant="gold" size="lg" className="w-full" disabled={busy || !canGenerate} onClick={() => generate()}>
                {busy && prepared ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {busy && prepared ? `${phase || "Génération…"} ${fmtDuration(elapsed)}` : "3 · Générer le CCTP"}
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

        {/* ══ Colonne document ══ */}
        <div className="space-y-4">
          {/* Audit préalable */}
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

          {/* Table unique des intervenants */}
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
                              onChange={(e) => updateActor(i, { status: e.target.value })}
                              className={cn("rounded border border-input bg-card px-1.5 py-1 text-xs",
                                a.status === "confirmed" ? "text-success" : a.status === "inferred" ? "text-warning-foreground" : "text-muted-foreground")}
                            >
                              {(["confirmed", "inferred", "missing"] as const).map((s) => (
                                <option key={s} value={s}>{s === "confirmed" ? "Confirmé" : s === "inferred" ? "Déduit" : "Absent"}</option>
                              ))}
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
            <EmptyState
              icon={FileText}
              title={prepared ? "Audit prêt — générez le CCTP" : "Le CCTP généré apparaîtra ici"}
              description={prepared
                ? "Vérifiez la table des intervenants et le rapport d’audit, puis cliquez « 3 · Générer le CCTP »."
                : "Renseignez les pièces et paramètres à gauche, puis lancez l’audit préalable (obligatoire)."}
            />
          ) : (
            <>
              {planContext && (
                <Card className="border-navy-100 bg-navy-50/40">
                  <CardHeader className="flex-row items-center gap-2">
                    <ScanText className="size-4 text-navy-600" />
                    <CardTitle className="text-sm text-navy-900">Synthèse des plans (source)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-navy-700">{planContext}</pre>
                  </CardContent>
                </Card>
              )}

              {/* Barre d'actions document */}
              <div className="sticky top-[76px] z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 backdrop-blur">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{sections.filter((s) => s.validated).length}/{sections.length} section(s) validée(s)</span>
                  {!previewMode && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setAllOpen(true)}><ChevronsUpDown className="size-4" /> Tout déplier</Button>
                      <Button variant="ghost" size="sm" onClick={() => setAllOpen(false)}><ChevronsDownUp className="size-4" /> Tout replier</Button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setPreviewMode((v) => !v)}>
                    {previewMode ? <PencilLine className="size-4" /> : <Eye className="size-4" />}
                    {previewMode ? "Édition" : "Aperçu document"}
                  </Button>
                  <Button variant="outline" size="sm" disabled={saving || locked} onClick={() => saveCctp()}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    {cctpId ? "Enregistrer" : "Sauvegarder"}
                  </Button>
                </div>
              </div>

              {previewMode ? (
                <CctpPreview
                  sections={sections}
                  actors={previewActors}
                  meta={{
                    projectName, projectType, owner,
                    jurisdiction, indice: docIndice, version: docVersion,
                    companyName: (company?.name as string) ?? undefined,
                  }}
                  className="rounded-xl border border-border"
                />
              ) : (
                <div className="space-y-3">
                  {sections.map((s, i) => {
                    const isOpen = open[i] ?? false;
                    const sectionRegister = verifyRegister.filter((p) => p.lot === s.lot);
                    return (
                      <AccordionItem
                        key={i}
                        open={isOpen}
                        onToggle={() => toggleOpen(i)}
                        header={<span className="font-semibold text-navy-900">{s.lot}</span>}
                        badge={
                          <>
                            {sectionRegister.length > 0 && (
                              <Badge variant="warning" title="Points à vérifier dans cette section">{sectionRegister.length} à vérifier</Badge>
                            )}
                            {s.validated ? <Badge variant="success">Validé</Badge> : <Badge variant="warning">À valider</Badge>}
                          </>
                        }
                      >
                        <div className="space-y-3">
                          <Textarea
                            value={s.content ?? ""}
                            readOnly={locked}
                            onChange={(e) => { setSections((arr) => arr.map((x, j) => j === i ? { ...x, content: e.target.value, validated: false } : x)); setDirty(true); }}
                            className="min-h-[280px] font-mono text-xs leading-relaxed"
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Button variant="ghost" size="sm" disabled={!cctpId} title={cctpId ? "Voir/créer les lignes DPGF liées à ce lot" : "Sauvegardez d'abord le CCTP"} onClick={goToDpgf}>
                              <Table2 className="size-4" /> Lignes DPGF liées
                            </Button>
                            <div className="flex gap-2">
                              {s.validated ? (
                                <Button variant="outline" size="sm" disabled={locked} onClick={() => { setSections((arr) => arr.map((x, j) => j === i ? { ...x, validated: false } : x)); setDirty(true); }}>
                                  <AlertTriangle className="size-4" /> Marquer à vérifier
                                </Button>
                              ) : (
                                <Button variant="default" size="sm" disabled={locked} onClick={() => { setSections((arr) => arr.map((x, j) => j === i ? { ...x, validated: true } : x)); setDirty(true); }}>
                                  <ShieldCheck className="size-4" /> Valider la section
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </AccordionItem>
                    );
                  })}
                </div>
              )}

              {/* Contrôle qualité : registre des points à vérifier */}
              <QualityPanel
                groups={qualityGroups}
                title={`Contrôle qualité — registre des points à vérifier (${verifyRegister.length})`}
              />

              {/* Export & chaînage */}
              <Card className="border-gold-200 bg-gold-50/40">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="text-sm text-navy-800">
                    {!allValidated
                      ? <p>Validez toutes les sections pour débloquer l’export officiel et le chaînage DPGF.</p>
                      : <p>Toutes les sections sont validées. Exportez le document ou générez le DPGF chaîné.</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Document généré automatiquement à partir des pièces fournies — validation MOE / BET / Bureau de contrôle requise.
                    </p>
                  </div>
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
                    <Button variant="default" disabled={!canExportCctp || !cctpId} title={!cctpId ? "Sauvegardez d'abord le CCTP" : "Générer le DPGF depuis ce CCTP"} onClick={goToDpgf}>
                      Générer le DPGF <ArrowRight className="size-4" />
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
