"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AccordionItem } from "@/components/ui/accordion";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney, cn } from "@/lib/utils";
import { LOTS_BTP, UNITS } from "@/lib/constants";
import { getCompany, getPrices, recordExportClient } from "@/lib/client-data";
import { useProject } from "@/lib/use-project";
import { useCurrency, convertAmount } from "@/lib/use-currency";
import { computeSousDetail, MISSING_LABELS } from "@/lib/price-math";
import {
  Loader2, Calculator, FileDown, Sparkles, Trash2, Plus, Save, Copy, Library,
  ShieldCheck, ArrowLeft, Table2, AlertTriangle, ListChecks,
} from "lucide-react";

type CompType = "MAIN_OEUVRE" | "MATERIAUX" | "MATERIEL" | "TRANSPORT";

interface Component {
  type: CompType;
  designation: string;
  unit: string;
  quantity: number;
  unitCost: number;
  costSource?: string | null;
}

interface LineRef {
  id: string; code?: string | null; designation: string; unit: string;
  quantity: number; unitPrice: number; lot?: string | null; dpgfId: string;
}

interface Fiche {
  key: number;
  id?: string;                    // id en base (persisté)
  dpgfLineId?: string | null;
  lineRef?: LineRef | null;
  designation: string;
  unit: string;
  lot?: string;
  quantity: number;
  yield: number;
  wasteRate: number;
  generalFeesRate: number;
  profitRate: number;
  targetPrice: number | null;
  components: Component[];
  hypotheses: string[];
  sources: string[];
  pointsToVerify: string[];
  validated: boolean;
  generated: boolean;
  open: boolean;
  dirty: boolean;
}

const TYPE_LABELS: Record<CompType, string> = {
  MATERIAUX: "Matériaux / Fournitures",
  MATERIEL: "Matériel",
  MAIN_OEUVRE: "Main-d’œuvre",
  TRANSPORT: "Transport / Amenée-repli",
};
const TYPE_ORDER: CompType[] = ["MATERIAUX", "MATERIEL", "MAIN_OEUVRE", "TRANSPORT"];

interface PriceItem { id: string; designation: string; unit: string; unitPrice: number; sellingPrice: number }

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export default function SousDetailPage() {
  return (
    <Suspense>
      <SousDetailInner />
    </Suspense>
  );
}

function SousDetailInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { project: activeProject } = useProject();
  const [pasteText, setPasteText] = useState("");
  const [defaultUnit, setDefaultUnit] = useState<string>("m²");
  const [defaultLot, setDefaultLot] = useState<string>("");
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [dpgfLines, setDpgfLines] = useState<LineRef[]>([]);
  const [dpgfId, setDpgfId] = useState<string | null>(null);
  const [dpgfTitle, setDpgfTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [prices, setPrices] = useState<PriceItem[]>([]);
  const idRef = useRef(1);

  const { currency, rate } = useCurrency();
  const money = (n: number) => formatMoney(n, currency);

  useEffect(() => {
    getCompany().catch(() => {});
    getPrices().then((items) => setPrices(items as never)).catch(() => {});
  }, []);

  const newFiche = (partial?: Partial<Fiche>): Fiche => ({
    key: idRef.current++,
    designation: "", unit: defaultUnit, lot: defaultLot || undefined,
    quantity: 0, yield: 1, wasteRate: 0, generalFeesRate: 0.10, profitRate: 0.10,
    targetPrice: null, components: [], hypotheses: [], sources: [], pointsToVerify: [],
    validated: false, generated: false, open: true, dirty: false,
    ...partial,
  });

  /** Fiche depuis un sous-détail persisté (GET). */
  function ficheFromSaved(sd: Record<string, unknown>, lineRef?: LineRef | null): Fiche {
    const parse = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
      if (typeof v === "string") { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } }
      return [];
    };
    return newFiche({
      id: sd.id as string,
      dpgfLineId: (sd.dpgfLineId as string) ?? null,
      lineRef: lineRef ?? (sd.dpgfLine as LineRef | null),
      designation: (sd.designation as string) ?? "",
      unit: (sd.unit as string) ?? "U",
      lot: (sd.lot as string) ?? undefined,
      quantity: Number(sd.quantity) || 0,
      yield: Number(sd.yield) || 1,
      wasteRate: Number(sd.wasteRate) || 0,
      generalFeesRate: Number(sd.generalFeesRate) ?? 0.10,
      profitRate: Number(sd.profitRate) ?? 0.10,
      targetPrice: sd.targetPrice != null ? Number(sd.targetPrice) : null,
      components: ((sd.components as Component[]) ?? []).map((c) => ({
        type: (["MAIN_OEUVRE", "MATERIAUX", "MATERIEL", "TRANSPORT"].includes(c.type) ? c.type : "MATERIAUX") as CompType,
        designation: c.designation, unit: c.unit,
        quantity: Number(c.quantity) || 0, unitCost: Number(c.unitCost) || 0,
        costSource: c.costSource ?? null,
      })),
      hypotheses: parse(sd.hypothesesList ?? sd.hypotheses),
      sources: parse(sd.sourcesList ?? sd.sources),
      pointsToVerify: parse(sd.pointsToVerifyList ?? sd.pointsToVerify),
      validated: !!sd.validated,
      generated: true,
      open: true,
    });
  }

  // ── Initialisation depuis l'URL (?lineId=&dpgfId= | ?dpgfId= | ?id=) ──
  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    const qLine = search.get("lineId");
    const qDpgf = search.get("dpgfId");
    const qId = search.get("id");
    const key = `${qLine ?? ""}|${qDpgf ?? ""}|${qId ?? ""}`;
    if (loadedRef.current === key || (!qLine && !qDpgf && !qId)) return;
    loadedRef.current = key;

    (async () => {
      try {
        if (qId) {
          const r = await fetch(`/api/sous-details/${qId}`);
          const d = await r.json();
          if (!d.sousDetail) { toast.error(d.error ?? "Sous-détail introuvable."); return; }
          const sd = d.sousDetail;
          if (sd.dpgfLine?.dpgfId) setDpgfId(sd.dpgfLine.dpgfId);
          setFiches([ficheFromSaved(sd)]);
          return;
        }
        if (qDpgf) {
          setDpgfId(qDpgf);
          const r = await fetch(`/api/dpgf/documents/${qDpgf}`);
          const d = await r.json();
          if (!d.dpgf) { toast.error(d.error ?? "DPGF introuvable."); return; }
          setDpgfTitle(d.dpgf.title ?? "");
          const lineRefs: LineRef[] = (d.dpgf.lines ?? []).map((l: LineRef & { sousDetail?: { id: string } | null }) => ({
            id: l.id, code: l.code, designation: l.designation, unit: l.unit,
            quantity: l.quantity, unitPrice: l.unitPrice, lot: l.lot, dpgfId: qDpgf,
          }));
          setDpgfLines(lineRefs);

          const rs = await fetch(`/api/sous-details?dpgfId=${qDpgf}`);
          const ds = await rs.json();
          const saved: Fiche[] = (ds.sousDetails ?? []).map((sd: Record<string, unknown>) => ficheFromSaved(sd));

          if (qLine) {
            const line = lineRefs.find((l) => l.id === qLine);
            const existing = saved.find((f) => f.dpgfLineId === qLine);
            if (existing) {
              setFiches([existing, ...saved.filter((f) => f !== existing).map((f) => ({ ...f, open: false }))]);
              toast.success("Sous-détail existant chargé pour cette ligne.");
            } else if (line) {
              const fresh = newFiche({
                dpgfLineId: line.id, lineRef: line,
                designation: line.designation, unit: line.unit, lot: line.lot ?? undefined,
                quantity: line.quantity, targetPrice: line.unitPrice > 0 ? line.unitPrice : null,
              });
              setFiches([fresh, ...saved.map((f) => ({ ...f, open: false }))]);
              toast.success(`Nouvelle fiche préparée pour « ${line.designation.slice(0, 60)} ». Générez la structure puis renseignez les coûts.`);
            } else {
              toast.error("Ligne DPGF introuvable dans ce document.");
              setFiches(saved);
            }
          } else {
            setFiches(saved.map((f, i) => ({ ...f, open: i === 0 })));
            if (saved.length === 0) toast.message("Aucun sous-détail pour ce DPGF — créez-les depuis le récapitulatif des lignes.");
          }
        }
      } catch {
        toast.error("Chargement impossible.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Conversion des coûts au changement de devise.
  const prevCurrency = useRef(currency);
  useEffect(() => {
    if (prevCurrency.current !== currency) {
      const from = prevCurrency.current;
      setFiches((arr) => arr.map((f) => ({
        ...f,
        targetPrice: f.targetPrice != null ? convertAmount(f.targetPrice, from, currency, rate) : null,
        components: f.components.map((c) => ({ ...c, unitCost: convertAmount(c.unitCost, from, currency, rate) })),
      })));
      prevCurrency.current = currency;
    }
  }, [currency, rate]);

  function loadFromPaste() {
    const linesArr = pasteText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (linesArr.length === 0) { toast.error("Collez au moins une désignation d’ouvrage."); return; }
    const items: Fiche[] = linesArr.map((line) => {
      const [desig, u] = line.split("|").map((s) => s.trim());
      return newFiche({ designation: desig, unit: u || defaultUnit, open: false });
    });
    setFiches((arr) => [...arr, ...items]);
    setPasteText("");
    toast.success(`${items.length} ouvrage(s) ajouté(s). Lancez la génération de structure.`);
  }

  async function generateAll() {
    const targets = fiches.filter((o) => o.designation.trim() && !o.generated);
    if (targets.length === 0) { toast.error("Ajoutez des ouvrages (avec désignation) à décomposer."); return; }
    setBusy(true);
    let done = 0;
    let failed = 0;
    for (const o of targets) {
      setPhase(`Structure ${++done}/${targets.length}…`);
      try {
        const res = await fetch("/api/sous-detail/generate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ designation: o.designation, unit: o.unit, lot: o.lot }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setFiches((arr) => arr.map((x) => x.key === o.key ? {
          ...x,
          components: (data.components ?? []).map((c: Component) => ({
            type: c.type, designation: c.designation, unit: c.unit,
            quantity: Number(c.quantity) || 0, unitCost: 0, costSource: null,
          })),
          yield: Number(data.yield) || x.yield,
          generalFeesRate: typeof data.generalFeesRate === "number" ? data.generalFeesRate : x.generalFeesRate,
          profitRate: typeof data.profitRate === "number" ? data.profitRate : x.profitRate,
          hypotheses: Array.isArray(data.hypotheses) ? data.hypotheses : [],
          pointsToVerify: Array.isArray(data.pointsToVerify) ? data.pointsToVerify : [],
          sources: x.lineRef ? [`Ligne CDPGF ${x.lineRef.code || ""} — ${x.lineRef.designation.slice(0, 80)}`] : x.sources,
          generated: true, open: true, dirty: true, validated: false,
        } : x));
      } catch (e) {
        failed++;
        toast.error(`${o.designation.slice(0, 40)} : ${e instanceof Error ? e.message : "échec"}`);
      }
    }
    setBusy(false);
    setPhase("");
    if (failed < targets.length) {
      toast.success(`${targets.length - failed}/${targets.length} structure(s) générée(s). Les coûts restent à renseigner (bibliothèque ou saisie) — jamais inventés.`);
    }
  }

  function patchFiche(key: number, patch: Partial<Fiche>) {
    setFiches((arr) => arr.map((o) => o.key === key ? { ...o, ...patch, dirty: patch.dirty ?? true } : o));
  }
  function removeFiche(key: number) {
    const f = fiches.find((x) => x.key === key);
    if (f?.id) {
      fetch(`/api/sous-details/${f.id}`, { method: "DELETE" }).catch(() => {});
    }
    setFiches((arr) => arr.filter((o) => o.key !== key));
  }
  function duplicateFiche(key: number) {
    const f = fiches.find((x) => x.key === key);
    if (!f) return;
    setFiches((arr) => [...arr, {
      ...f, key: idRef.current++, id: undefined, dpgfLineId: null, lineRef: null,
      designation: `${f.designation} (copie)`, validated: false, open: true, dirty: true,
    }]);
    toast.success("Fiche dupliquée (non reliée — à rattacher ou utiliser librement).");
  }
  function updateComp(key: number, ci: number, patch: Partial<Component>) {
    setFiches((arr) => arr.map((o) => {
      if (o.key !== key) return o;
      const components = o.components.map((c, j) => {
        if (j !== ci) return c;
        const next = { ...c, ...patch };
        // Saisie manuelle d'un coût → provenance explicite « manuel ».
        if (patch.unitCost !== undefined && patch.costSource === undefined) {
          next.costSource = patch.unitCost > 0 ? "manuel" : null;
        }
        return next;
      });
      return { ...o, components, validated: false, dirty: true };
    }));
  }
  function addComp(key: number, type: CompType) {
    setFiches((arr) => arr.map((o) => o.key === key ? {
      ...o, components: [...o.components, { type, designation: "", unit: "U", quantity: 1, unitCost: 0, costSource: null }],
      validated: false, dirty: true,
    } : o));
  }
  function removeComp(key: number, ci: number) {
    setFiches((arr) => arr.map((o) => o.key === key ? { ...o, components: o.components.filter((_, j) => j !== ci), validated: false, dirty: true } : o));
  }

  /** Importe les coûts depuis la bibliothèque (composants sans coût). */
  function importCostsFromLibrary(key: number) {
    if (prices.length === 0) { toast.error("Bibliothèque de prix vide."); return; }
    let matched = 0;
    setFiches((arr) => arr.map((o) => {
      if (o.key !== key) return o;
      const components = o.components.map((c) => {
        if (c.unitCost > 0) return c;
        const nc = norm(c.designation);
        if (!nc) return c;
        const cands = prices.filter((p) => { const np = norm(p.designation); return np && (nc.includes(np) || np.includes(nc)); });
        if (cands.length === 0) return c;
        const best = cands.sort((a, b) => b.designation.length - a.designation.length)[0];
        matched++;
        return { ...c, unitCost: best.unitPrice, costSource: "bibliotheque" };
      });
      return { ...o, components, dirty: true, validated: false };
    }));
    toast[matched > 0 ? "success" : "message"](`${matched} coût(s) importé(s) depuis la bibliothèque.${matched === 0 ? " Aucune correspondance — renseignez les coûts manuellement." : ""}`);
  }

  /** Sauvegarde (création ou mise à jour) d'une fiche. */
  async function saveFiche(key: number, opts?: { validate?: boolean }) {
    const f = fiches.find((x) => x.key === key);
    if (!f) return;
    if (!f.designation.trim()) { toast.error("Désignation requise."); return; }
    try {
      const payload = {
        dpgfLineId: f.dpgfLineId ?? undefined,
        designation: f.designation, unit: f.unit, lot: f.lot,
        quantity: f.quantity, yield: f.yield, wasteRate: f.wasteRate,
        generalFeesRate: f.generalFeesRate, profitRate: f.profitRate,
        targetPrice: f.targetPrice,
        hypotheses: f.hypotheses, sources: f.sources, pointsToVerify: f.pointsToVerify,
        components: f.components,
        ...(opts?.validate ? { validated: true } : {}),
      };
      if (!f.id) {
        const res = await fetch("/api/sous-details", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const d = await res.json();
        if (res.status === 409 && d.existingId) {
          toast.error("Un sous-détail existe déjà pour cette ligne — il va être chargé.");
          const r2 = await fetch(`/api/sous-details/${d.existingId}`);
          const d2 = await r2.json();
          if (d2.sousDetail) patchFiche(key, { ...ficheFromSaved(d2.sousDetail), key, dirty: false });
          return;
        }
        if (!res.ok) throw new Error(d.error);
        patchFiche(key, { id: d.sousDetail.id, dirty: false, validated: !!d.sousDetail.validated });
        toast.success("Sous-détail sauvegardé.");
      } else {
        const res = await fetch(`/api/sous-details/${f.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        patchFiche(key, { dirty: false, validated: !!d.sousDetail.validated });
        toast.success(opts?.validate ? "Sous-détail validé." : "Modifications enregistrées.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sauvegarde impossible.");
    }
  }

  const ready = fiches.filter((o) => o.components.length > 0);
  const computed = useMemo(() => new Map(fiches.map((f) => [f.key, computeSousDetail({
    components: f.components, wasteRate: f.wasteRate,
    generalFeesRate: f.generalFeesRate, profitRate: f.profitRate, targetPrice: f.targetPrice,
  })])), [fiches]);

  const canExport = ready.length > 0 && ready.every((f) => f.validated);

  const dsPayload = () => ready.map((o) => {
    const c = computed.get(o.key)!;
    return {
      designation: o.designation || "Ouvrage", unit: o.unit, lot: o.lot,
      components: o.components,
      wasteRate: o.wasteRate, generalFeesRate: o.generalFeesRate, profitRate: o.profitRate,
      targetPrice: o.targetPrice, debourseSec: c.debourseSec, sellingPrice: c.sellingPrice,
      hypotheses: o.hypotheses, sources: o.sources, pointsToVerify: o.pointsToVerify,
    };
  });

  async function exportDs(kind: "excel" | "pdf") {
    try {
      const fresh = await getCompany(true);
      const m = await import("@/lib/export-debourse-sec");
      const comp = { ...(fresh as object), currency } as never;
      const filename = `sous-details-metrika.${kind === "excel" ? "xlsx" : "pdf"}`;
      if (kind === "excel") await m.exportDebourseSecExcel(dsPayload(), comp);
      else await m.exportDebourseSecPdf(dsPayload(), comp);
      recordExportClient({ docType: "SOUS_DETAIL", format: kind === "excel" ? "XLSX" : "PDF", filename, projectId: activeProject?.id ?? null });
      toast.success("Export généré.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    }
  }

  async function buildDsBytes() {
    const fresh = await getCompany(true);
    const m = await import("@/lib/export-debourse-sec");
    return m.exportDebourseSecPdf(dsPayload(), { ...(fresh as object), currency } as never, { download: false });
  }

  /** Lignes DPGF sans sous-détail (mode chaîné). */
  const linesWithoutSd = dpgfLines.filter((l) => !fiches.some((f) => f.dpgfLineId === l.id));

  /** Récapitulatif par lot. */
  const recapByLot = useMemo(() => {
    const map = new Map<string, { fiches: Fiche[]; ds: number; pv: number }>();
    for (const f of ready) {
      const lot = f.lot || "Sans lot";
      const c = computed.get(f.key)!;
      const e = map.get(lot) ?? { fiches: [], ds: 0, pv: 0 };
      e.fiches.push(f);
      e.ds += c.debourseSec;
      e.pv += c.sellingPrice;
      map.set(lot, e);
    }
    return [...map.entries()];
  }, [ready, computed]);

  const inputSm = "rounded border border-input bg-card px-2 py-1 text-right tabular-nums";

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Étude de prix"
        title="Sous-détail"
        accent="de prix"
        description="Chaque ligne CDPGF devient une fiche : structure générée (hypothèses tracées), coûts issus de VOTRE bibliothèque ou de votre saisie — jamais inventés — puis déboursé sec, PV HT et écart au prix CDPGF."
      />

      {/* Contexte chaînage */}
      {dpgfId && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="gold" className="max-w-[320px] gap-1.5">
            <Table2 className="size-3 shrink-0" /> <span className="truncate">{dpgfTitle || "DPGF lié"}</span>
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => router.push(`/agents/dpgf?id=${dpgfId}`)}>
            <ArrowLeft className="size-3.5" /> Retour au CDPGF
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit">
          <CardHeader><CardTitle className="text-navy-900">Ouvrages à décomposer</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {dpgfId && linesWithoutSd.length > 0 && (
              <div className="space-y-2 rounded-lg border border-navy-100 bg-navy-50/30 p-3">
                <Label className="flex items-center gap-1.5 text-navy-800"><Table2 className="size-3.5 text-navy-600" /> Lignes CDPGF sans sous-détail ({linesWithoutSd.length})</Label>
                <ul className="max-h-56 space-y-1 overflow-auto">
                  {linesWithoutSd.map((l) => (
                    <li key={l.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs">
                      <span className="min-w-0 flex-1 truncate text-navy-800" title={l.designation}>
                        {l.code ? `${l.code} · ` : ""}{l.designation}
                      </span>
                      <Button
                        variant="ghost" size="sm" className="h-6 shrink-0 px-2 text-[11px]"
                        onClick={() => setFiches((arr) => [newFiche({
                          dpgfLineId: l.id, lineRef: l, designation: l.designation, unit: l.unit,
                          lot: l.lot ?? undefined, quantity: l.quantity,
                          targetPrice: l.unitPrice > 0 ? l.unitPrice : null,
                        }), ...arr])}
                      >
                        <Plus className="size-3" /> Créer
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <Label>Désignations libres (une par ligne)</Label>
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                className="min-h-[110px] font-mono text-xs"
                placeholder={"Collez des lignes DPGF, une par ligne.\nFormat toléré : Désignation | unité\nEx : Béton armé pour poteaux dosé à 350 kg/m³ | m³"}
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
              <Button variant="ghost" onClick={() => setFiches((arr) => [...arr, newFiche()])}><Plus className="size-4" /> Vide</Button>
            </div>
            <Button variant="gold" size="lg" className="w-full" disabled={busy || fiches.length === 0} onClick={generateAll}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? (phase || "Génération…") : "Générer les structures"}
            </Button>
            <p className="text-xs text-muted-foreground">
              La génération produit la <strong>structure</strong> (composants, coefficients-hypothèses, points à vérifier). Les <strong>coûts restent à 0</strong> tant que vous ne les importez pas de la bibliothèque ou ne les saisissez pas.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {fiches.length === 0 ? (
            <EmptyState
              icon={Calculator}
              title="Les fiches de sous-détail s’afficheront ici"
              description={dpgfId
                ? "Créez une fiche depuis une ligne CDPGF (panneau de gauche), ou collez des désignations libres."
                : "Ouvrez un CDPGF sauvegardé (bouton calculatrice sur une ligne) pour des fiches chaînées, ou collez des désignations libres."}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{ready.length}/{fiches.length} fiche(s) structurée(s) · {ready.filter((f) => f.validated).length} validée(s)</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={!canExport} onClick={() => exportDs("excel")}><FileDown className="size-4" /> XLSX</Button>
                  <Button variant="gold" size="sm" disabled={!canExport} onClick={() => exportDs("pdf")}><FileDown className="size-4" /> PDF</Button>
                  {canExport && <SaveToClientLazy build={buildDsBytes} />}
                </div>
              </div>

              {fiches.map((o) => {
                const c = computed.get(o.key)!;
                return (
                  <AccordionItem
                    key={o.key}
                    open={o.open}
                    onToggle={() => patchFiche(o.key, { open: !o.open, dirty: o.dirty })}
                    header={
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-navy-900">{o.designation || "Nouvel ouvrage"}</span>
                        <span className="text-xs text-muted-foreground">
                          / {o.unit}{o.lot ? ` · ${o.lot}` : ""}
                          {o.lineRef ? ` · ligne CDPGF ${o.lineRef.code || ""}` : ""}
                          {o.id ? "" : " · non sauvegardé"}
                        </span>
                      </span>
                    }
                    badge={
                      <>
                        <span className="text-right">
                          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">PV HT / {o.unit}</span>
                          <span className={cn("font-semibold tabular-nums", c.complete ? "text-gold-600" : "text-muted-foreground")}>
                            {c.complete ? money(c.sellingPrice) : `${money(c.sellingPrice)} (partiel)`}
                          </span>
                        </span>
                        {o.validated ? <Badge variant="success">Validé</Badge> : c.missingCosts > 0 ? <Badge variant="warning">{c.missingCosts} coût(s) à renseigner</Badge> : <Badge variant="muted">{o.components.length}</Badge>}
                      </>
                    }
                  >
                    <div className="space-y-4">
                      {/* En-tête fiche : identité + paramètres */}
                      <div className="grid gap-2 sm:grid-cols-[1fr_90px_90px_auto]">
                        <input value={o.designation} onChange={(e) => patchFiche(o.key, { designation: e.target.value })} placeholder="Désignation de l’ouvrage" className="w-full rounded border border-input bg-card px-2 py-1 text-sm font-medium text-navy-800" />
                        <select value={o.unit} onChange={(e) => patchFiche(o.key, { unit: e.target.value })} className="rounded border border-input bg-card px-2 py-1 text-sm">
                          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                          {!(UNITS as readonly string[]).includes(o.unit) && o.unit ? <option value={o.unit}>{o.unit}</option> : null}
                        </select>
                        <input type="number" value={o.quantity} onChange={(e) => patchFiche(o.key, { quantity: +e.target.value })} title="Quantité de la ligne CDPGF" className={cn(inputSm, "text-sm")} placeholder="Qté" />
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" title="Dupliquer la fiche" onClick={() => duplicateFiche(o.key)}><Copy className="size-4" /></Button>
                          <button onClick={() => removeFiche(o.key)} title="Supprimer la fiche" className="text-muted-foreground/60 hover:text-destructive"><Trash2 className="size-4" /></button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/20 p-2.5 text-xs sm:grid-cols-4">
                        <label className="space-y-0.5">
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Rendement (u/j)</span>
                          <input type="number" step="0.1" value={o.yield} onChange={(e) => patchFiche(o.key, { yield: +e.target.value })} className={cn(inputSm, "w-full")} />
                        </label>
                        <label className="space-y-0.5">
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pertes / chutes (%)</span>
                          <input type="number" step="0.5" value={Math.round(o.wasteRate * 1000) / 10} onChange={(e) => patchFiche(o.key, { wasteRate: (+e.target.value || 0) / 100 })} className={cn(inputSm, "w-full")} />
                        </label>
                        <label className="space-y-0.5">
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Frais généraux (%)</span>
                          <input type="number" step="0.5" value={Math.round(o.generalFeesRate * 1000) / 10} onChange={(e) => patchFiche(o.key, { generalFeesRate: (+e.target.value || 0) / 100 })} className={cn(inputSm, "w-full")} />
                        </label>
                        <label className="space-y-0.5">
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Marge (%)</span>
                          <input type="number" step="0.5" value={Math.round(o.profitRate * 1000) / 10} onChange={(e) => patchFiche(o.key, { profitRate: (+e.target.value || 0) / 100 })} className={cn(inputSm, "w-full")} />
                        </label>
                      </div>

                      {/* Composants par famille */}
                      {TYPE_ORDER.map((type) => {
                        const rows = o.components.map((c2, ci) => ({ c: c2, ci })).filter(({ c: c2 }) => c2.type === type);
                        return (
                          <div key={type}>
                            <div className="mb-1.5 flex items-center justify-between">
                              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gold-600">{TYPE_LABELS[type]}</h3>
                              <button onClick={() => addComp(o.key, type)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-navy-700"><Plus className="size-3.5" /> Ajouter</button>
                            </div>
                            {rows.length === 0 ? (
                              <p className="text-xs italic text-muted-foreground/60">Aucun poste.</p>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                                    <th className="pb-1 pr-2">Poste</th>
                                    <th className="pb-1 px-2">U.</th>
                                    <th className="pb-1 px-2 text-right">Qté / u</th>
                                    <th className="pb-1 px-2 text-right">Coût U. ({currency === "EUR" ? "€" : "MAD"})</th>
                                    <th className="pb-1 px-2 text-right">Montant</th>
                                    <th className="pb-1 pl-2"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map(({ c: comp, ci }) => {
                                    const costMissing = comp.unitCost <= 0 && !comp.costSource;
                                    return (
                                      <tr key={ci} className="border-b border-border/60">
                                        <td className="py-1.5 pr-2"><input value={comp.designation} onChange={(e) => updateComp(o.key, ci, { designation: e.target.value })} className="w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-input focus:border-input" placeholder="Désignation" /></td>
                                        <td className="px-2 py-1.5"><input value={comp.unit} onChange={(e) => updateComp(o.key, ci, { unit: e.target.value })} className="w-12 rounded border border-input bg-card px-1 py-1" /></td>
                                        <td className="px-2 py-1.5 text-right"><input type="number" step="0.01" value={comp.quantity} onChange={(e) => updateComp(o.key, ci, { quantity: +e.target.value })} className={cn(inputSm, "w-16")} /></td>
                                        <td className="px-2 py-1.5 text-right">
                                          <input type="number" step="0.01" value={comp.unitCost} onChange={(e) => updateComp(o.key, ci, { unitCost: +e.target.value })} className={cn(inputSm, "w-24", costMissing && "border-warning/60 bg-warning/5")} />
                                          {costMissing
                                            ? <p className="mt-0.5 text-[10px] font-medium text-warning-foreground">{MISSING_LABELS.cost}</p>
                                            : comp.costSource ? <p className="mt-0.5 text-[10px] text-muted-foreground">{comp.costSource === "bibliotheque" ? "Bibliothèque" : "Saisie"}</p> : null}
                                        </td>
                                        <td className="px-2 py-1.5 text-right font-medium tabular-nums text-navy-900">{money(comp.quantity * comp.unitCost)}</td>
                                        <td className="pl-2 py-1.5 text-right"><button onClick={() => removeComp(o.key, ci)} title="Supprimer"><Trash2 className="size-4 text-muted-foreground/50 hover:text-destructive" /></button></td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        );
                      })}

                      {/* Synthèse calculée */}
                      <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm sm:grid-cols-2">
                        <div className="space-y-1 text-xs">
                          {TYPE_ORDER.filter((t) => (c.byType[t] ?? 0) > 0).map((t) => (
                            <p key={t} className="flex justify-between text-muted-foreground"><span>{TYPE_LABELS[t]}</span><span className="tabular-nums">{money(c.byType[t] ?? 0)}</span></p>
                          ))}
                          {c.wasteAmount > 0 && <p className="flex justify-between text-muted-foreground"><span>Pertes / chutes ({Math.round(o.wasteRate * 100)}%)</span><span className="tabular-nums">{money(c.wasteAmount)}</span></p>}
                          <p className="flex justify-between border-t border-border pt-1 font-semibold text-navy-900"><span>Déboursé sec / {o.unit}</span><span className="tabular-nums">{money(c.debourseSec)}</span></p>
                          <p className="flex justify-between text-muted-foreground"><span>Frais généraux ({Math.round(o.generalFeesRate * 100)}%)</span><span className="tabular-nums">{money(c.generalFees)}</span></p>
                          <p className="flex justify-between text-muted-foreground"><span>Marge ({Math.round(o.profitRate * 100)}%)</span><span className="tabular-nums">{money(c.profit)}</span></p>
                          <p className="flex justify-between border-t border-border pt-1 text-base font-semibold text-navy-900"><span>Prix de vente HT / {o.unit}</span><span className="tabular-nums text-gold-600">{money(c.sellingPrice)}</span></p>
                        </div>
                        <div className="space-y-2 text-xs">
                          <label className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Prix CDPGF cible ({currency === "EUR" ? "€" : "MAD"})</span>
                            <input
                              type="number" step="0.01"
                              value={o.targetPrice ?? ""}
                              placeholder={MISSING_LABELS.price}
                              onChange={(e) => patchFiche(o.key, { targetPrice: e.target.value === "" ? null : +e.target.value })}
                              className={cn(inputSm, "w-28")}
                            />
                          </label>
                          {c.ecart !== null ? (
                            <p className={cn("flex items-center justify-between rounded-md border px-2 py-1.5 font-medium",
                              Math.abs(c.ecartPct ?? 0) <= 5 ? "border-success/40 bg-success/5 text-success" : "border-warning/50 bg-warning/10 text-warning-foreground")}>
                              <span>Écart vs prix CDPGF</span>
                              <span className="tabular-nums">{c.ecart >= 0 ? "+" : ""}{money(c.ecart)} ({c.ecartPct! >= 0 ? "+" : ""}{c.ecartPct} %)</span>
                            </p>
                          ) : (
                            <p className="text-muted-foreground">Pas de prix CDPGF cible — l’écart sera calculé quand la ligne sera chiffrée.</p>
                          )}
                          {!c.complete && (
                            <p className="flex items-start gap-1.5 rounded-md border border-warning/50 bg-warning/10 px-2 py-1.5 text-warning-foreground">
                              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                              {c.missingCosts} coût(s) à renseigner : le PV est partiel et non exploitable en l’état.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Hypothèses / sources / points à vérifier */}
                      {(o.hypotheses.length > 0 || o.pointsToVerify.length > 0 || o.sources.length > 0) && (
                        <div className="grid gap-3 text-xs sm:grid-cols-3">
                          {o.sources.length > 0 && (
                            <div className="rounded-md border border-navy-100 bg-navy-50/40 p-2.5">
                              <p className="mb-1 font-semibold uppercase tracking-wide text-navy-700">Sources</p>
                              <ul className="list-disc space-y-0.5 pl-4 text-navy-800">{o.sources.map((h, i) => <li key={i}>{h}</li>)}</ul>
                            </div>
                          )}
                          {o.hypotheses.length > 0 && (
                            <div className="rounded-md border border-gold-200 bg-gold-50/40 p-2.5">
                              <p className="mb-1 font-semibold uppercase tracking-wide text-gold-700">Hypothèses (non contractuelles)</p>
                              <ul className="list-disc space-y-0.5 pl-4 text-navy-800">{o.hypotheses.map((h, i) => <li key={i}>{h}</li>)}</ul>
                            </div>
                          )}
                          {o.pointsToVerify.length > 0 && (
                            <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5">
                              <p className="mb-1 flex items-center gap-1 font-semibold uppercase tracking-wide text-warning-foreground"><ListChecks className="size-3.5" /> Points à vérifier</p>
                              <ul className="list-disc space-y-0.5 pl-4 text-navy-800">{o.pointsToVerify.map((h, i) => <li key={i}>{h}</li>)}</ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Actions fiche */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => importCostsFromLibrary(o.key)}>
                            <Library className="size-4" /> Importer coûts (bibliothèque)
                          </Button>
                          {o.lineRef && (
                            <Button variant="ghost" size="sm" onClick={() => router.push(`/agents/dpgf?id=${o.lineRef!.dpgfId}`)}>
                              <ArrowLeft className="size-4" /> Retour CDPGF
                            </Button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => saveFiche(o.key)}>
                            <Save className="size-4" /> {o.id ? "Enregistrer" : "Sauvegarder"}{o.dirty && o.id ? " *" : ""}
                          </Button>
                          <Button
                            variant={o.validated ? "outline" : "default"} size="sm"
                            disabled={c.missingCosts > 0 && !o.validated}
                            title={c.missingCosts > 0 ? "Renseignez tous les coûts avant validation" : undefined}
                            onClick={() => o.validated ? patchFiche(o.key, { validated: false }) : saveFiche(o.key, { validate: true })}
                          >
                            <ShieldCheck className="size-4" /> {o.validated ? "Dévalider" : "Valider"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </AccordionItem>
                );
              })}

              {/* Récapitulatif par lot */}
              {recapByLot.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2 text-sm text-navy-900"><Calculator className="size-4 text-navy-600" /> Récapitulatif des sous-détails par lot</CardTitle></CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left uppercase tracking-wider text-muted-foreground">
                          <th className="pb-1.5 pr-2">Lot / ouvrage</th>
                          <th className="pb-1.5 px-2">U.</th>
                          <th className="pb-1.5 px-2 text-right">Déboursé sec</th>
                          <th className="pb-1.5 px-2 text-right">PV HT</th>
                          <th className="pb-1.5 px-2 text-right">Prix CDPGF</th>
                          <th className="pb-1.5 pl-2 text-right">Écart</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recapByLot.map(([lot, e]) => (
                          <FicheRecapGroup key={lot} lot={lot} fiches={e.fiches} computed={computed} money={money} />
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FicheRecapGroup({ lot, fiches, computed, money }: {
  lot: string;
  fiches: Fiche[];
  computed: Map<number, ReturnType<typeof computeSousDetail>>;
  money: (n: number) => string;
}) {
  return (
    <>
      <tr className="border-b border-border/60 bg-muted/30">
        <td colSpan={6} className="px-2 py-1.5 font-semibold text-navy-900">{lot} ({fiches.length})</td>
      </tr>
      {fiches.map((f) => {
        const c = computed.get(f.key)!;
        return (
          <tr key={f.key} className="border-b border-border/40">
            <td className="max-w-[320px] truncate py-1.5 pl-4 pr-2 text-navy-800" title={f.designation}>{f.designation}</td>
            <td className="px-2 py-1.5 text-muted-foreground">{f.unit}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{money(c.debourseSec)}</td>
            <td className={cn("px-2 py-1.5 text-right font-medium tabular-nums", c.complete ? "text-navy-900" : "text-muted-foreground")}>{money(c.sellingPrice)}{!c.complete && " *"}</td>
            <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{f.targetPrice != null ? money(f.targetPrice) : "—"}</td>
            <td className={cn("py-1.5 pl-2 text-right font-medium tabular-nums", c.ecart === null ? "text-muted-foreground" : Math.abs(c.ecartPct ?? 0) <= 5 ? "text-success" : "text-warning-foreground")}>
              {c.ecart !== null ? `${c.ecart >= 0 ? "+" : ""}${c.ecartPct} %` : "—"}
            </td>
          </tr>
        );
      })}
    </>
  );
}

/** Import différé de SaveToClient (évite d'alourdir le bundle si non utilisé). */
function SaveToClientLazy({ build }: { build: () => Promise<Uint8Array> }) {
  const [Comp, setComp] = useState<ComponentType<{ category: string; filename: string; build: () => Promise<Uint8Array> }> | null>(null);
  useEffect(() => {
    import("@/components/clients/save-to-client").then((m) => setComp(() => m.SaveToClient)).catch(() => {});
  }, []);
  if (!Comp) return null;
  return <Comp category="Sous-détail" filename="sous-details-metrika.pdf" build={build} />;
}
