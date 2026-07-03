"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { SourceChip } from "@/components/ui/source-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { QualityPanel, type QualityGroup } from "@/components/quality/quality-panel";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { PdfDropzone } from "@/components/ui/pdf-dropzone";
import { SaveToClient } from "@/components/clients/save-to-client";
import { formatMoney, cn } from "@/lib/utils";
import { UNITS, LOTS_BTP } from "@/lib/constants";
import { useCurrency, convertAmount } from "@/lib/use-currency";
import { useProject } from "@/lib/use-project";
import { getCompany, getPrices, recordExportClient } from "@/lib/client-data";
import { DPGF_STATUS } from "@/lib/dpgf-fidelity";
import { dpgfBlockingErrors } from "@/lib/blocking-errors";
import { computeDpgfTotals, quantityKnown, priceKnown, MISSING_LABELS } from "@/lib/price-math";
import { compareCctpDpgf, extractCctpArticles } from "@/lib/dpgf-compare";
import { fidelityScore } from "@/lib/fidelity";
import { usePulseOnChange } from "@/lib/use-reveal";
import {
  Loader2, Table2, CheckCircle2, FileDown, Sparkles, FileText, X, Plus, Trash2,
  Library, AlertTriangle, Save, Calculator, Lock, LockOpen, Eye, GitCompare, FolderKanban, ArrowRight,
} from "lucide-react";

interface Line {
  id?: string;
  lot: string; code?: string; designation: string; description?: string;
  unit: string; quantity: number; unitPrice: number;
  quantitySource?: string; status?: string; confidence?: string;
  sourceExcerpt?: string; calculation?: string; priceSource?: string | null;
  comment?: string; cctpSectionId?: string | null; cctpArticle?: string | null;
  validated: boolean; locked?: boolean;
  sousDetailId?: string;
}

interface CctpSectionLite { id?: string; lot: string; content: string }
interface StructureLine { code?: string; designation: string }
interface StructureDiff { missing: StructureLine[]; extra: StructureLine[] }

const lineStatus = (l: { status?: string; quantity: number }): string =>
  l.status || (l.quantity > 0 ? "confirmed" : "to_measure");

interface PriceItem { id: string; designation: string; unit: string; sellingPrice: number; lot?: string | null; category?: string | null }

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const emptyLine = (): Line => ({
  lot: LOTS_BTP[1] ?? "Gros Œuvre", designation: "", description: "",
  unit: "U", quantity: 0, unitPrice: 0, validated: false,
  quantitySource: "none", status: "to_measure", priceSource: null,
});

export default function DpgfPage() {
  return (
    <Suspense>
      <DpgfInner />
    </Suspense>
  );
}

function DpgfInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { currency, rate } = useCurrency();
  const { project: activeProject } = useProject();
  const money = (n: number) => formatMoney(n, currency);

  // ── Sources ──
  const [cctpText, setCctpText] = useState("");
  const [planNotes, setPlanNotes] = useState("");
  const [cctpFiles, setCctpFiles] = useState<File[]>([]);
  const [cdpgfFiles, setCdpgfFiles] = useState<File[]>([]);
  const [cdpgfText, setCdpgfText] = useState("");

  // ── Document ──
  const [lines, setLines] = useState<Line[]>([]);
  const [tab, setTab] = useState<"dpgf" | "cdpgf">("dpgf");
  const [provisional, setProvisional] = useState<boolean | null>(null);
  const [detectedCurrency, setDetectedCurrency] = useState("");
  const [structureDiff, setStructureDiff] = useState<StructureDiff | null>(null);

  // ── Chaînage ──
  const [projectId, setProjectId] = useState<string | null>(null);
  const [cctpId, setCctpId] = useState<string | null>(null);
  const [cctpTitle, setCctpTitle] = useState("");
  const [cctpSections, setCctpSections] = useState<CctpSectionLite[]>([]);
  const [sourcePlanContext, setSourcePlanContext] = useState("");
  const [dpgfId, setDpgfId] = useState<string | null>(null);
  const [docStatus, setDocStatus] = useState("DRAFT");
  const [docVersion, setDocVersion] = useState(1);
  const [docIndice, setDocIndice] = useState("A");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [articleDrawer, setArticleDrawer] = useState<{ lot: string; article?: string | null; content: string } | null>(null);

  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);
  const [prices, setPrices] = useState<PriceItem[]>([]);

  useEffect(() => {
    getCompany().then(setCompany);
    getPrices().then((items) => setPrices(items as never)).catch(() => {});
  }, []);

  // ── Initialisation depuis l'URL : ?cctpId= (chaînage), ?id= (DPGF sauvegardé) ──
  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    const qProject = search.get("projectId");
    if (qProject) setProjectId(qProject);
    else if (activeProject?.id) setProjectId((p) => p ?? activeProject.id);

    const qCctp = search.get("cctpId");
    const qId = search.get("id");
    const key = `${qCctp ?? ""}|${qId ?? ""}`;
    if (loadedRef.current === key || (!qCctp && !qId)) return;
    loadedRef.current = key;

    if (qId) {
      // Ouverture d'un DPGF sauvegardé.
      fetch(`/api/dpgf/documents/${qId}`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.dpgf) { toast.error(d.error ?? "DPGF introuvable."); return; }
          const doc = d.dpgf;
          setDpgfId(doc.id);
          setDocStatus(doc.status);
          setDocVersion(doc.version);
          setDocIndice(doc.indice);
          setProjectId(doc.projectId ?? null);
          setTab(doc.mode === "cdpgf" ? "cdpgf" : "dpgf");
          setProvisional(doc.provisional);
          setDetectedCurrency(doc.currency ?? "");
          setLines((doc.lines ?? []).map((l: Line & { sousDetail?: { id: string } | null }) => ({
            ...l, sousDetailId: l.sousDetail?.id,
          })));
          if (doc.cctp) {
            setCctpId(doc.cctp.id);
            setCctpTitle(doc.cctp.title);
            // Sections complètes pour la comparaison / le drawer article.
            fetch(`/api/cctp/documents/${doc.cctp.id}`)
              .then((r) => r.json())
              .then((c) => { if (c.cctp) setCctpSections(c.cctp.sections.map((s: CctpSectionLite) => ({ id: s.id, lot: s.lot, content: s.content }))); })
              .catch(() => {});
          }
          toast.success(`DPGF « ${doc.title} » chargé (v${doc.version}-${doc.indice}).`);
        })
        .catch(() => toast.error("Chargement du DPGF impossible."));
    } else if (qCctp) {
      // Chaînage : préparer la génération depuis un CCTP sauvegardé.
      fetch(`/api/cctp/documents/${qCctp}`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.cctp) { toast.error(d.error ?? "CCTP introuvable."); return; }
          setCctpId(d.cctp.id);
          setCctpTitle(d.cctp.title);
          setProjectId((p) => p ?? d.cctp.projectId ?? null);
          const secs = (d.cctp.sections ?? []).map((s: CctpSectionLite) => ({ id: s.id, lot: s.lot, content: s.content }));
          setCctpSections(secs);
          setCctpText(secs.map((s: CctpSectionLite) => `===== LOT : ${s.lot} =====\n${s.content}`).join("\n\n"));
          // Synthèse des plans du CCTP source : matière première du métré
          // (quantités calculées depuis les cotes, status "calculated").
          setSourcePlanContext(d.cctp.planContext ?? "");
          const nonValid = (d.cctp.sections ?? []).filter((s: { validated?: boolean }) => !s.validated).length;
          toast.success(`CCTP « ${d.cctp.title} » chargé comme source (${secs.length} lot(s)).${nonValid ? ` ${nonValid} section(s) non validée(s) — le DPGF restera provisoire.` : ""}`);
        })
        .catch(() => toast.error("Chargement du CCTP source impossible."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeProject?.id]);

  // ── Bibliothèque de prix ──
  function pickPrice(i: number, priceId: string) {
    const p = prices.find((x) => x.id === priceId);
    if (!p) return;
    update(i, { unitPrice: p.sellingPrice, unit: p.unit || lines[i].unit, priceSource: "bibliotheque", validated: false });
  }
  function autofillFromLibrary() {
    if (prices.length === 0) { toast.error("Bibliothèque de prix vide. Ajoutez des prix d'abord."); return; }
    let matched = 0;
    setLines((arr) => arr.map((l) => {
      if (l.locked) return l;
      const nl = norm(l.designation);
      if (!nl) return l;
      const cands = prices.filter((p) => { const np = norm(p.designation); return np && (nl.includes(np) || np.includes(nl)); });
      if (cands.length === 0) return l;
      const best = cands.sort((a, b) => b.designation.length - a.designation.length)[0];
      matched++;
      return { ...l, unitPrice: best.sellingPrice, priceSource: "bibliotheque", validated: false };
    }));
    setDirty(true);
    toast.success(`${matched} ligne(s) chiffrée(s) depuis la bibliothèque.`);
  }

  // Conversion des prix au changement de devise (switch topbar).
  const prevCurrency = useRef(currency);
  useEffect(() => {
    if (prevCurrency.current !== currency) {
      const from = prevCurrency.current;
      setLines((arr) => arr.map((l) => (l.locked ? l : { ...l, unitPrice: convertAmount(l.unitPrice, from, currency, rate) })));
      prevCurrency.current = currency;
    }
  }, [currency, rate]);

  /** Rattache chaque ligne générée à sa section CCTP (par lot) + article (texte). */
  function attachToCctp(got: Line[]): Line[] {
    if (cctpSections.length === 0) return got;
    const articles = extractCctpArticles(cctpSections);
    return got.map((l) => {
      const sec = cctpSections.find((s) => norm(s.lot) === norm(l.lot))
        ?? cctpSections.find((s) => norm(l.lot).includes(norm(s.lot)) || norm(s.lot).includes(norm(l.lot)));
      if (!sec) return l;
      const lt = new Set(norm(l.designation).split(/\s+/).filter((w) => w.length > 3));
      let best: { heading: string; score: number } | null = null;
      for (const a of articles.filter((a) => a.sectionId === sec.id || norm(a.lot) === norm(sec.lot))) {
        const at = new Set(norm(a.heading).split(/\s+/).filter((w) => w.length > 3));
        let common = 0;
        for (const w of lt) if (at.has(w)) common++;
        const score = common / Math.max(1, Math.min(lt.size, at.size));
        if (score >= 0.5 && (!best || score > best.score)) best = { heading: a.heading, score };
      }
      return { ...l, cctpSectionId: sec.id ?? null, cctpArticle: best?.heading ?? null };
    });
  }

  async function convert() {
    if (!cctpText.trim() && cctpFiles.length === 0 && !cdpgfText.trim() && cdpgfFiles.length === 0) {
      toast.error("Ajoutez le CCTP (ou un CDPGF officiel) : un PDF, un CCTP sauvegardé ou du texte collé.");
      return;
    }
    setBusy(true);
    try {
      let extractedText = "";
      const cctpImages: { data: string; mediaType: string }[] = [];
      if (cctpFiles.length > 0) {
        setPhase("Lecture du CCTP…");
        const { extractPdfText, rasterizePdfBudgeted } = await import("@/lib/pdf-render");
        const scanned: string[] = [];
        for (const f of cctpFiles) {
          const t = await extractPdfText(f).catch(() => "");
          if (t && t.length > 150) {
            extractedText += `\n\n===== ${f.name} =====\n${t}`;
          } else {
            const r = await rasterizePdfBudgeted(f);
            cctpImages.push(...r.images);
            scanned.push(f.name);
          }
        }
        if (scanned.length) toast.message(`${scanned.length} PDF scanné(s) lu(s) en image (qualité réduite si volumineux).`);
      }

      let cdpgfExtracted = "";
      if (cdpgfFiles.length > 0) {
        setPhase("Lecture du CDPGF officiel…");
        const { extractPdfText } = await import("@/lib/pdf-render");
        for (const f of cdpgfFiles) {
          const t = await extractPdfText(f).catch(() => "");
          if (t && t.trim().length > 100) cdpgfExtracted += `\n\n===== ${f.name} =====\n${t}`;
          else toast.warning(`CDPGF « ${f.name} » illisible (PDF scanné/protégé ?). Collez le texte du cadre pour l'utiliser comme structure maître.`);
        }
      }
      const officialCdpgf = [cdpgfText, cdpgfExtracted].filter((s) => s && s.trim()).join("\n\n");

      const fullText = [cctpText, extractedText].filter((s) => s && s.trim()).join("\n\n");
      if (!fullText.trim() && cctpImages.length === 0 && !officialCdpgf.trim()) {
        toast.error("CCTP/CDPGF illisible ou vide. Collez le texte à la place.");
        setBusy(false); setPhase(""); return;
      }

      setPhase("Analyse…");
      const res = await fetch("/api/dpgf/convert", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cctpText: fullText,
          planNotes: [planNotes, sourcePlanContext ? `SYNTHÈSE DES PLANS DU PROJET (source de métré — quantités calculables depuis ces cotes) :\n${sourcePlanContext}` : ""]
            .filter(Boolean).join("\n\n"),
          officialCdpgf,
          cctpImages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const got = attachToCctp(((data.lines ?? []) as Line[]).map((l) => ({ ...l, unitPrice: 0, priceSource: null, validated: false })));
      setLines(got);
      setDpgfId(null); setDocStatus("DRAFT"); setDocVersion(1); setDocIndice("A");
      setProvisional(typeof data.provisional === "boolean" ? data.provisional : !officialCdpgf.trim());
      setDetectedCurrency(typeof data.currency === "string" ? data.currency : "");
      setStructureDiff(data.structureDiff && (data.structureDiff.missing?.length || data.structureDiff.extra?.length) ? data.structureDiff : null);
      const confirmed = got.filter((l) => lineStatus(l) === "confirmed" || lineStatus(l) === "calculated").length;
      const toMeasure = got.filter((l) => lineStatus(l) === "to_measure").length;
      const conflicts = got.filter((l) => lineStatus(l) === "conflict").length;
      toast.success(
        `${got.length} ouvrage(s) ${officialCdpgf.trim() ? "repris du CDPGF officiel" : "extraits"} — ${confirmed} sourcé(s), ${toMeasure} « À métrer »${conflicts ? `, ${conflicts} à arbitrer` : ""}.`,
      );
      await saveDpgf(got, { silent: false, provisionalOverride: typeof data.provisional === "boolean" ? data.provisional : !officialCdpgf.trim(), currencyOverride: typeof data.currency === "string" ? data.currency : "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally { setBusy(false); setPhase(""); }
  }

  function update(i: number, patch: Partial<Line>) {
    setLines((arr) => arr.map((l, j) => {
      if (j !== i || l.locked) return l;
      const next = { ...l, ...patch };
      // Saisie manuelle d'une quantité = métré utilisateur (source explicite).
      if (patch.quantity !== undefined && patch.quantity !== l.quantity) {
        next.quantitySource = patch.quantity > 0 ? "metre" : (l.quantitySource === "metre" ? "none" : l.quantitySource);
        next.status = patch.quantity > 0 ? "confirmed" : "to_measure";
      }
      // Saisie manuelle d'un prix = provenance « manuel » (jamais silencieuse).
      if (patch.unitPrice !== undefined && patch.unitPrice !== l.unitPrice && patch.priceSource === undefined) {
        next.priceSource = patch.unitPrice > 0 ? "manuel" : null;
      }
      return next;
    }));
    setDirty(true);
  }
  function addManualLine() {
    setLines((arr) => [...arr, emptyLine()]);
    setDirty(true);
  }
  function removeLine(i: number) {
    if (lines[i]?.locked) { toast.error("Ligne verrouillée — déverrouillez-la d'abord."); return; }
    setLines((arr) => arr.filter((_, j) => j !== i));
    setDirty(true);
  }
  function toggleAllValidated() {
    setLines((arr) => {
      const target = !(arr.length > 0 && arr.every((l) => l.validated || l.locked));
      return arr.map((l) => (l.locked ? l : { ...l, validated: target }));
    });
    setDirty(true);
  }
  function toggleLock(i: number) {
    const l = lines[i];
    if (!l.validated && !l.locked) { toast.error("Validez la ligne avant de la verrouiller."); return; }
    setLines((arr) => arr.map((x, j) => (j === i ? { ...x, locked: !x.locked } : x)));
    setDirty(true);
  }

  /** Sauvegarde (création / mise à jour) du DPGF. */
  async function saveDpgf(data?: Line[], opts?: { silent?: boolean; provisionalOverride?: boolean; currencyOverride?: string }) {
    const lns = data ?? lines;
    if (lns.length === 0) { toast.error("Rien à sauvegarder."); return; }
    setSaving(true);
    try {
      const title = cctpTitle
        ? `DPGF — ${cctpTitle.replace(/^CCTP\s*—\s*/i, "")}`
        : `DPGF — ${new Date().toLocaleDateString("fr-FR")}`;
      const payload = {
        title,
        projectId,
        cctpId,
        mode: tab,
        provisional: opts?.provisionalOverride ?? provisional ?? true,
        currency: opts?.currencyOverride ?? detectedCurrency ?? null,
        vatRate,
        lines: lns,
      };
      if (!dpgfId) {
        const res = await fetch("/api/dpgf/documents", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setDpgfId(d.dpgf.id);
        setDocStatus(d.dpgf.status);
        setDocVersion(d.dpgf.version);
        setDocIndice(d.dpgf.indice);
        // Récupère les ids de lignes (nécessaires pour les sous-détails).
        const ordered = (d.dpgf.lines ?? []) as { id: string; order: number }[];
        setLines((arr) => arr.map((l, i) => ({ ...l, id: ordered[i]?.id ?? l.id })));
        if (!opts?.silent) toast.success("DPGF sauvegardé — chaîné au projet et au CCTP source.");
      } else {
        const res = await fetch(`/api/dpgf/documents/${dpgfId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, lockLines: lns.filter((l) => l.locked && l.id).map((l) => l.id) }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setDocStatus(d.dpgf.status);
        setLines((d.dpgf.lines ?? []).map((l: Line & { sousDetail?: { id: string } | null }) => ({ ...l, sousDetailId: l.sousDetail?.id })));
        if (!opts?.silent) toast.success("Modifications enregistrées.");
      }
      setDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sauvegarde impossible.");
    } finally {
      setSaving(false);
    }
  }

  function openArticle(l: Line) {
    const sec = cctpSections.find((s) => s.id === l.cctpSectionId)
      ?? cctpSections.find((s) => norm(s.lot) === norm(l.lot));
    if (!sec) { toast.error("Article CCTP source non disponible (CCTP non chargé)."); return; }
    setArticleDrawer({ lot: sec.lot, article: l.cctpArticle, content: sec.content });
  }

  function goToSousDetail(l: Line) {
    if (!l.id || !dpgfId) { toast.error("Sauvegardez d'abord le DPGF (les lignes doivent exister en base)."); return; }
    router.push(`/agents/sous-detail?lineId=${l.id}&dpgfId=${dpgfId}`);
  }

  // ── Dérivés ──
  const vatRate = Number(activeProject?.vatRate) || Number(company?.vatRate) || 20;
  const totals = useMemo(() => computeDpgfTotals(lines, vatRate), [lines, vatRate]);
  const totalRef = usePulseOnChange<HTMLSpanElement>(totals.totalTTC);
  const allValidated = lines.length > 0 && lines.every((l) => l.validated || l.locked);
  const cur = currency === "EUR" ? "€" : "MAD";
  const blocking = dpgfBlockingErrors(lines, { priced: tab === "cdpgf" });
  const canExport = allValidated && blocking.length === 0;
  const locked = docStatus === "VALIDATED";
  const score = useMemo(() => fidelityScore(lines), [lines]);

  const compare = useMemo(
    () => (cctpSections.length ? compareCctpDpgf(cctpSections, lines, { priced: tab === "cdpgf" }) : null),
    [cctpSections, lines, tab],
  );
  const compareGroups: QualityGroup[] = useMemo(() => {
    if (!compare) {
      return [
        {
          key: "missingQ", label: "Quantités manquantes (« Q à renseigner »)", tone: "warning",
          items: lines.map((l, i) => ({ i, l })).filter(({ l }) => !quantityKnown(l)).map(({ i, l }) => ({ message: `Ligne ${i + 1} — ${l.designation || "(sans désignation)"}` })),
        },
        ...(tab === "cdpgf" ? [{
          key: "missingP", label: "Prix manquants (« Prix à renseigner »)", tone: "warning" as const,
          items: lines.map((l, i) => ({ i, l })).filter(({ l }) => !priceKnown(l)).map(({ i, l }) => ({ message: `Ligne ${i + 1} — ${l.designation || "(sans désignation)"}` })),
        }] : []),
      ];
    }
    return [
      {
        key: "omissions", label: "Articles CCTP sans ligne DPGF (omissions)", tone: "destructive",
        items: compare.omissions.map((o) => ({ message: `${o.lot} — ${o.heading}`, detail: o.chapter })),
      },
      {
        key: "orphans", label: "Lignes DPGF sans article CCTP", tone: "warning",
        items: compare.orphanLines.map((i) => ({ message: `Ligne ${i + 1} — ${lines[i]?.designation ?? ""}` })),
      },
      {
        key: "dups", label: "Doublons (même désignation, même lot)", tone: "warning",
        items: compare.duplicates.map((i) => ({ message: `Ligne ${i + 1} — ${lines[i]?.designation ?? ""}` })),
      },
      {
        key: "units", label: "Unités incohérentes / inconnues", tone: "warning",
        items: compare.unitIssues.map(({ index, unit }) => ({ message: `Ligne ${index + 1} — unité « ${unit || "vide"} » — ${lines[index]?.designation ?? ""}` })),
      },
      {
        key: "missingQ", label: "Quantités manquantes (« Q à renseigner »)", tone: "muted",
        items: compare.missingQuantities.map((i) => ({ message: `Ligne ${i + 1} — ${lines[i]?.designation ?? ""}` })),
      },
      ...(tab === "cdpgf" ? [{
        key: "missingP", label: "Prix manquants (« Prix à renseigner »)", tone: "muted" as const,
        items: compare.missingPrices.map((i) => ({ message: `Ligne ${i + 1} — ${lines[i]?.designation ?? ""}` })),
      }] : []),
    ];
  }, [compare, lines, tab]);

  // ── Exports ──
  async function exportDpgf(kind: "excel" | "docx" | "pdf") {
    try {
      const fresh = await getCompany(true);
      setCompany(fresh);
      const payload = { ...(fresh as object), currency } as never;
      const isProvisional = provisional !== false;
      const m = await import("@/lib/export-dpgf");
      const filename = `dpgf-metrika.${kind === "excel" ? "xlsx" : kind}`;
      if (kind === "excel") await m.exportDpgfExcel(lines, payload, isProvisional);
      else if (kind === "docx") await m.exportDpgfDocx(lines, payload, isProvisional);
      else await m.exportDpgfPdf(lines, payload, vatRate, { provisional: isProvisional });
      recordExportClient({ docType: "DPGF", format: kind === "excel" ? "XLSX" : kind === "pdf" ? "PDF" : "DOCX", filename, docId: dpgfId, projectId });
      toast.success("Export généré.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    }
  }

  async function buildDpgfBytes() {
    const fresh = await getCompany(true);
    const m = await import("@/lib/export-dpgf");
    return m.exportDpgfPdf(lines, { ...(fresh as object), currency } as never, vatRate, { download: false, provisional: provisional !== false });
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Décomposition de prix"
        title="DPGF / CDPGF"
        accent="CCTP → DPGF"
        description="Chaque ligne est reliée à son article CCTP source et tracée (source, statut, formule). Quantités et prix manquants restent marqués « à renseigner » — jamais inventés."
      />

      {/* Contexte document */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {projectId ? (
          <Badge variant="default" className="gap-1.5"><FolderKanban className="size-3" /> {activeProject?.id === projectId ? activeProject.name : "Projet lié"}</Badge>
        ) : <Badge variant="muted">Sans projet</Badge>}
        {cctpId ? (
          <Badge variant="gold" className="gap-1.5 max-w-[280px]">
            <FileText className="size-3 shrink-0" /> <span className="truncate">Source : {cctpTitle || "CCTP"}</span>
          </Badge>
        ) : null}
        {dpgfId ? (
          <>
            <Badge variant="outline" className="tabular-nums">v{docVersion} · indice {docIndice}</Badge>
            <StatusBadge status={docStatus} />
          </>
        ) : lines.length > 0 ? <Badge variant="warning">Non sauvegardé</Badge> : null}
        {dirty && dpgfId ? <Badge variant="warning">Modifications non enregistrées</Badge> : null}
        {cctpId && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => router.push(`/agents/cctp?id=${cctpId}`)}>
            Voir le CCTP source <ArrowRight className="size-3.5" />
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit">
          <CardHeader><CardTitle className="text-navy-900">Sources du DPGF</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {cctpSections.length > 0 && (
              <div className="rounded-md border border-success/40 bg-success/5 px-3 py-2 text-xs text-navy-800">
                <p className="flex items-center gap-1.5 font-semibold text-success"><CheckCircle2 className="size-3.5" /> CCTP sauvegardé chargé comme source</p>
                <p className="mt-0.5 text-muted-foreground">{cctpSections.length} lot(s) — les lignes générées seront reliées aux articles CCTP.</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>CCTP en PDF</Label>
              <PdfDropzone
                title="Glissez le(s) CCTP en PDF ici ou cliquez"
                hint="Lu automatiquement (texte + tableaux)"
                onFiles={(list) => setCctpFiles((p) => [...p, ...list])}
              />
              {cctpFiles.length > 0 && (
                <ul className="space-y-1.5">
                  {cctpFiles.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-navy-800">{f.name}</span>
                      <button onClick={() => setCctpFiles((p) => p.filter((_, j) => j !== i))} className="text-destructive hover:opacity-70"><X className="size-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-2">
              <Label>…ou coller le texte du CCTP (optionnel)</Label>
              <Textarea value={cctpText} onChange={(e) => setCctpText(e.target.value)} className="min-h-[110px]" placeholder="Collez ici le contenu du CCTP si vous n’avez pas de PDF…" />
            </div>
            <div className="space-y-2">
              <Label>Dimensions / plans (optionnel)</Label>
              <Textarea value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} placeholder="Surfaces, longueurs, volumes connus…" />
            </div>

            <div className="space-y-2 rounded-lg border border-navy-100 bg-navy-50/30 p-3">
              <Label className="flex items-center gap-1.5 text-navy-800">
                <Library className="size-3.5 text-navy-600" /> CDPGF / DPGF officiel (optionnel)
              </Label>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                S’il est fourni, son cadre devient la <strong>structure maître</strong> : postes, numéros et unités repris à l’identique. Sinon, le DPGF généré est <strong>provisoire (non contractuel)</strong>.
              </p>
              <PdfDropzone
                title="Glissez le CDPGF officiel (PDF) ici"
                hint="Cadre repris à l’identique"
                onFiles={(list) => setCdpgfFiles((p) => [...p, ...list])}
              />
              {cdpgfFiles.length > 0 && (
                <ul className="space-y-1.5">
                  {cdpgfFiles.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-navy-800">{f.name}</span>
                      <button onClick={() => setCdpgfFiles((p) => p.filter((_, j) => j !== i))} className="text-destructive hover:opacity-70"><X className="size-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <Textarea value={cdpgfText} onChange={(e) => setCdpgfText(e.target.value)} className="min-h-[80px] text-xs" placeholder="…ou collez le cadre du CDPGF officiel" />
            </div>

            <Button variant="gold" size="lg" className="w-full" disabled={busy || locked} onClick={convert}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? (phase || "Analyse…") : "Générer le DPGF"}
            </Button>
            <Button variant="outline" className="w-full" disabled={locked} onClick={addManualLine}>
              <Plus className="size-4" /> Ajouter une ligne manuelle
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {lines.length === 0 ? (
            <EmptyState
              icon={Table2}
              title="Le tableau DPGF apparaîtra ici"
              description="Générez depuis un CCTP (sauvegardé, PDF ou texte), reprenez un CDPGF officiel, ou saisissez manuellement."
              actions={<Button variant="outline" size="sm" onClick={addManualLine}><Plus className="size-4" /> Saisir manuellement</Button>}
            />
          ) : (
            <>
              <Card>
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-navy-900">{tab === "dpgf" ? "Métré (DPGF)" : "Chiffrage (CDPGF)"} · {lines.length} lignes</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant={allValidated ? "success" : "warning"}>
                        {lines.filter((l) => l.validated || l.locked).length}/{lines.length} validées
                      </Badge>
                      <Button variant="outline" size="sm" disabled={locked} onClick={toggleAllValidated}>
                        <CheckCircle2 className="size-4" /> {allValidated ? "Tout dévalider" : "Tout valider"}
                      </Button>
                      <Button variant="outline" size="sm" disabled={saving} onClick={() => saveDpgf()}>
                        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                        {dpgfId ? "Enregistrer" : "Sauvegarder"}
                      </Button>
                    </div>
                  </div>
                  <div className="flex w-fit gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
                    {([["dpgf", "DPGF — métré (sans prix)"], ["cdpgf", "CDPGF — chiffré"]] as const).map(([v, label]) => (
                      <button
                        key={v}
                        onClick={() => { setTab(v); setDirty(true); }}
                        className={cn("rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                          tab === v ? "bg-gold-500 text-navy-900 shadow-gold" : "text-muted-foreground hover:text-navy-800")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tab === "dpgf"
                      ? "Désignations et quantités (métré). Les prix se renseignent dans l’onglet CDPGF."
                      : "Chiffrage connecté à la bibliothèque de prix. Un prix non renseigné reste « Prix à renseigner »."}
                  </p>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {provisional === false ? (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-success/40 bg-success/5 px-3 py-2 text-xs text-navy-800">
                      <CheckCircle2 className="size-4 shrink-0 text-success" />
                      <span><strong>Structure officielle CDPGF appliquée</strong> — postes, numéros et unités repris à l’identique. Devise : {detectedCurrency ? <strong>{detectedCurrency}</strong> : <strong className="text-warning-foreground">à confirmer</strong>}.</span>
                    </div>
                  ) : (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-navy-800">
                      <Table2 className="size-4 shrink-0 text-warning-foreground" />
                      <span><strong>DPGF provisoire</strong> généré à partir des pièces fournies — <strong>non contractuel</strong>. Fournissez un CDPGF officiel pour figer le cadre.{detectedCurrency ? ` Devise : ${detectedCurrency}.` : ""}</span>
                    </div>
                  )}
                  {structureDiff && (
                    <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-navy-800">
                      <p className="flex items-center gap-1.5 font-semibold text-destructive"><X className="size-3.5" /> Écart avec le cadre officiel — à vérifier</p>
                      {structureDiff.missing.length > 0 && (
                        <p className="mt-1">{structureDiff.missing.length} poste(s) du CDPGF officiel <strong>absent(s)</strong> du DPGF : {structureDiff.missing.slice(0, 6).map((m) => m.designation).join(" · ")}{structureDiff.missing.length > 6 ? "…" : ""}</p>
                      )}
                      {structureDiff.extra.length > 0 && (
                        <p className="mt-1">{structureDiff.extra.length} ligne(s) <strong>hors cadre</strong> (ajoutées) : {structureDiff.extra.slice(0, 6).map((m) => m.designation).join(" · ")}{structureDiff.extra.length > 6 ? "…" : ""}</p>
                      )}
                    </div>
                  )}
                  {tab === "cdpgf" && (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-gold-200 bg-gold-50/40 px-3 py-2 text-xs">
                      <span className="flex items-center gap-1.5 text-navy-800">
                        <Library className="size-4 text-gold-600" /> Bibliothèque de prix connectée ({prices.length} prix)
                      </span>
                      <Button variant="outline" size="sm" disabled={prices.length === 0 || locked} onClick={autofillFromLibrary}>
                        Remplir les P.U. depuis la bibliothèque
                      </Button>
                    </div>
                  )}

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 pr-2 w-14">Réf</th>
                        <th className="pb-2 pr-2">Désignation & traçabilité</th>
                        <th className="pb-2 px-2">U.</th>
                        <th className="pb-2 px-2 text-right">Qté</th>
                        {tab === "cdpgf" && <>
                          <th className="pb-2 px-2 text-right">P.U. HT ({cur})</th>
                          <th className="pb-2 px-2 text-right">Montant HT</th>
                        </>}
                        <th className="pb-2 pl-2 w-24"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => {
                        const qKnown = quantityKnown(l);
                        const pKnown = priceKnown(l);
                        const isLocked = !!l.locked || locked;
                        return (
                          <tr key={l.id ?? i} className={cn("border-b border-border/60 align-top", l.locked && "bg-muted/20")}>
                            <td className="py-2 pr-2">
                              <input
                                value={l.code ?? ""}
                                readOnly={isLocked}
                                onChange={(e) => update(i, { code: e.target.value, validated: false })}
                                placeholder={String(i + 1)}
                                className="w-12 rounded border border-input bg-card px-1.5 py-1 text-xs tabular-nums text-muted-foreground"
                                title="Référence / n° d'article"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                value={l.designation}
                                readOnly={isLocked}
                                onChange={(e) => update(i, { designation: e.target.value, validated: false })}
                                placeholder="Désignation de l’ouvrage"
                                className="w-full rounded border border-input bg-card px-2 py-1 font-medium text-navy-800"
                              />
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <select
                                  value={l.lot}
                                  disabled={isLocked}
                                  onChange={(e) => update(i, { lot: e.target.value, validated: false })}
                                  className="rounded border border-input bg-card px-1.5 py-0.5 text-xs text-muted-foreground"
                                >
                                  {LOTS_BTP.map((lot) => <option key={lot} value={lot}>{lot}</option>)}
                                  {!(LOTS_BTP as readonly string[]).includes(l.lot) && l.lot ? <option value={l.lot}>{l.lot}</option> : null}
                                </select>
                                {(() => {
                                  const st = DPGF_STATUS[lineStatus(l) as keyof typeof DPGF_STATUS] ?? DPGF_STATUS.to_measure;
                                  return <Badge variant={st.variant} title={l.calculation ? `Formule : ${l.calculation}` : undefined}>{st.label}</Badge>;
                                })()}
                                <SourceChip
                                  source={l.quantitySource}
                                  excerpt={l.sourceExcerpt}
                                  onOpen={l.cctpSectionId || cctpSections.length ? () => openArticle(l) : undefined}
                                />
                                {l.cctpArticle ? (
                                  <button
                                    type="button"
                                    onClick={() => openArticle(l)}
                                    className="max-w-[220px] truncate rounded border border-navy-100 bg-navy-50 px-1.5 py-0.5 text-[10px] font-medium text-navy-700 hover:border-gold-400"
                                    title={`Article CCTP source : ${l.cctpArticle}`}
                                  >
                                    § {l.cctpArticle}
                                  </button>
                                ) : null}
                                <input
                                  value={l.comment ?? ""}
                                  readOnly={isLocked}
                                  onChange={(e) => update(i, { comment: e.target.value })}
                                  placeholder="Commentaire"
                                  className="min-w-[100px] flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-muted-foreground hover:border-input focus:border-input"
                                />
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <select
                                value={l.unit}
                                disabled={isLocked}
                                onChange={(e) => update(i, { unit: e.target.value, validated: false })}
                                className="w-16 rounded border border-input bg-card px-1 py-1 text-muted-foreground"
                              >
                                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                                {!(UNITS as readonly string[]).includes(l.unit) && l.unit ? <option value={l.unit}>{l.unit}</option> : null}
                              </select>
                            </td>
                            <td className="px-2 py-2 text-right">
                              <input
                                type="number"
                                value={l.quantity}
                                readOnly={isLocked}
                                onChange={(e) => update(i, { quantity: +e.target.value, validated: false })}
                                className={cn("w-20 rounded border px-2 py-1 text-right tabular-nums", qKnown ? "border-input bg-card" : "border-warning/60 bg-warning/5")}
                              />
                              {!qKnown && <p className="mt-0.5 text-[10px] font-medium text-warning-foreground">{MISSING_LABELS.quantity}</p>}
                            </td>
                            {tab === "cdpgf" && <>
                              <td className="px-2 py-2 text-right">
                                <div className="flex flex-col items-end gap-1">
                                  <input
                                    type="number"
                                    value={l.unitPrice}
                                    readOnly={isLocked}
                                    onChange={(e) => update(i, { unitPrice: +e.target.value, validated: false })}
                                    className={cn("w-24 rounded border px-2 py-1 text-right tabular-nums", pKnown ? "border-input bg-card" : "border-warning/60 bg-warning/5")}
                                  />
                                  {!pKnown ? (
                                    <p className="text-[10px] font-medium text-warning-foreground">{MISSING_LABELS.price}</p>
                                  ) : l.priceSource ? (
                                    <span className="text-[10px] text-muted-foreground">{l.priceSource === "bibliotheque" ? "Bibliothèque" : l.priceSource === "manuel" ? "Saisie" : l.priceSource}</span>
                                  ) : null}
                                  {!isLocked && prices.length > 0 && (
                                    <select
                                      value=""
                                      onChange={(e) => { pickPrice(i, e.target.value); e.currentTarget.value = ""; }}
                                      className="w-24 rounded border border-input bg-card px-1 py-0.5 text-[10px] text-muted-foreground"
                                      title="Choisir un prix de la bibliothèque"
                                    >
                                      <option value="">Bibliothèque…</option>
                                      {prices.map((p) => <option key={p.id} value={p.id}>{p.designation.slice(0, 40)} — {money(p.sellingPrice)}/{p.unit}</option>)}
                                    </select>
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-2 text-right font-medium tabular-nums text-navy-900">
                                {qKnown && pKnown ? money(l.quantity * l.unitPrice) : <span className="text-muted-foreground">—</span>}
                              </td>
                            </>}
                            <td className="pl-2 py-2">
                              <div className="flex items-center gap-1">
                                <button disabled={locked} onClick={() => update(i, { validated: !l.validated })} title={l.validated ? "Dévalider" : "Valider la ligne"}>
                                  <CheckCircle2 className={l.validated || l.locked ? "size-5 text-success" : "size-5 text-muted-foreground/40"} />
                                </button>
                                <button disabled={locked} onClick={() => toggleLock(i)} title={l.locked ? "Déverrouiller la ligne" : "Verrouiller la ligne validée"}>
                                  {l.locked ? <Lock className="size-4 text-navy-700" /> : <LockOpen className="size-4 text-muted-foreground/50 hover:text-navy-700" />}
                                </button>
                                <button
                                  onClick={() => goToSousDetail(l)}
                                  title={l.sousDetailId ? "Voir le sous-détail de prix" : "Créer le sous-détail de prix"}
                                  className={cn(l.sousDetailId ? "text-gold-600" : "text-muted-foreground/50 hover:text-gold-600")}
                                >
                                  <Calculator className="size-4" />
                                </button>
                                <button disabled={isLocked} onClick={() => removeLine(i)} title="Supprimer la ligne" className="text-muted-foreground/50 hover:text-destructive">
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Totaux */}
                  {tab === "cdpgf" && (
                    <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-[220px] space-y-1 text-xs text-muted-foreground">
                        <p className="font-semibold uppercase tracking-wide">Sous-totaux HT par lot</p>
                        {totals.byLot.map((b) => (
                          <p key={b.lot} className="flex justify-between gap-4">
                            <span className="truncate">{b.lot} ({b.lines})</span>
                            <span className="tabular-nums text-navy-800">{money(b.totalHT)}</span>
                          </p>
                        ))}
                        {(totals.missingQuantities > 0 || totals.missingPrices > 0) && (
                          <p className="text-warning-foreground">
                            Totaux partiels : {totals.missingQuantities} quantité(s) et {totals.missingPrices} prix à renseigner.
                          </p>
                        )}
                      </div>
                      <div className="w-64 space-y-1.5 text-sm">
                        <div className="flex justify-between text-muted-foreground"><span>Total HT</span><span className="font-medium tabular-nums text-navy-800">{money(totals.totalHT)}</span></div>
                        <div className="flex justify-between text-muted-foreground"><span>TVA ({vatRate} %)</span><span className="tabular-nums">{money(totals.totalVAT)}</span></div>
                        <div className="flex justify-between border-t border-navy-200 pt-1.5 text-base font-semibold text-navy-900">
                          <span>Total TTC</span>
                          <span ref={totalRef} className="tabular-nums text-gold-600">{money(totals.totalTTC)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {tab === "cdpgf" && allValidated && blocking.length > 0 && (
                    <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-navy-800">
                      <p className="flex items-center gap-1.5 font-semibold text-destructive"><AlertTriangle className="size-3.5" /> {blocking.length} erreur(s) bloquante(s) — export désactivé</p>
                      <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-auto pl-4">
                        {blocking.slice(0, 12).map((e, i) => <li key={i}><span className="text-muted-foreground">{e.ref} :</span> {e.message}</li>)}
                        {blocking.length > 12 ? <li className="text-muted-foreground">… +{blocking.length - 12} autre(s)</li> : null}
                      </ul>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <Button variant="ghost" size="sm" disabled={locked} onClick={addManualLine}>
                      <Plus className="size-4" /> Ajouter une ligne
                    </Button>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" disabled={!canExport} onClick={() => exportDpgf("excel")}><FileDown className="size-4" /> XLSX</Button>
                      <Button variant="outline" disabled={!canExport} onClick={() => exportDpgf("docx")}><FileDown className="size-4" /> DOCX</Button>
                      <Button variant="gold" disabled={!canExport} onClick={() => exportDpgf("pdf")}><FileDown className="size-4" /> PDF</Button>
                    </div>
                  </div>
                  {canExport && (
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground">
                        Document généré automatiquement à partir des pièces fournies — validation MOE / BET / Bureau de contrôle requise.
                      </p>
                      <SaveToClient category="DPGF" filename="cdpgf-metrika.pdf" build={buildDpgfBytes} />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Comparaison CCTP ↔ DPGF + traçabilité */}
              <QualityPanel
                score={score}
                groups={compareGroups}
                title={cctpSections.length ? "Comparaison CCTP ↔ DPGF & contrôle qualité" : "Contrôle qualité"}
              />
              {!cctpSections.length && lines.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GitCompare className="size-3.5" /> Pour la comparaison CCTP ↔ DPGF complète (omissions, hors-cadre), générez depuis un CCTP sauvegardé (bouton « Générer le DPGF » de l’agent CCTP) ou l’<button className="underline hover:text-navy-800" onClick={() => router.push("/agents/audit")}>audit dédié</button>.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Drawer : article CCTP source */}
      <Drawer open={!!articleDrawer} onOpenChange={(o) => !o && setArticleDrawer(null)}>
        <DrawerContent side="right" className="w-full sm:max-w-xl">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2"><FileText className="size-4 text-navy-600" /> Article CCTP source</DrawerTitle>
            <DrawerDescription>
              {articleDrawer?.lot}{articleDrawer?.article ? ` — § ${articleDrawer.article}` : " — section complète"}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-navy-800">
              {(() => {
                if (!articleDrawer) return "";
                if (!articleDrawer.article) return articleDrawer.content;
                // Extrait le passage de l'article (du titre ### correspondant au suivant).
                const linesArr = articleDrawer.content.split("\n");
                const start = linesArr.findIndex((ln) => ln.trim().startsWith("### ") && norm(ln).includes(norm(articleDrawer.article!).slice(0, 40)));
                if (start < 0) return articleDrawer.content;
                let end = linesArr.length;
                for (let i = start + 1; i < linesArr.length; i++) {
                  if (/^\s{0,3}##/.test(linesArr[i])) { end = i; break; }
                }
                return linesArr.slice(start, end).join("\n");
              })()}
            </pre>
          </div>
          {cctpId && (
            <div className="border-t border-border p-4">
              <Button variant="outline" size="sm" className="w-full" onClick={() => router.push(`/agents/cctp?id=${cctpId}`)}>
                <Eye className="size-4" /> Ouvrir le CCTP complet
              </Button>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
