"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useProject } from "@/lib/use-project";
import { PROJECT_TYPES, JURISDICTIONS, PROJECT_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  FolderKanban, Plus, Loader2, FileText, Table2, AlertTriangle, MapPin, CheckCircle2,
} from "lucide-react";

interface ProjectRow {
  id: string;
  name: string;
  reference?: string | null;
  type?: string | null;
  location?: string | null;
  status: string;
  jurisdiction: string;
  currency?: string | null;
  vatRate?: number | null;
  updatedAt: string;
  client?: { id: string; name: string } | null;
  _count: { cctps: number; dpgfs: number; documents: number; issues: number };
}

const statusLabel = (s: string) => PROJECT_STATUSES.find((x) => x.value === s)?.label ?? s;

export default function ProjetsPage() {
  return (
    <Suspense>
      <ProjetsInner />
    </Suspense>
  );
}

function ProjetsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { project: active, setProject } = useProject();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({
    name: "", reference: "", type: PROJECT_TYPES[0] as string, location: "",
    jurisdiction: "Maroc", currency: "MAD", description: "",
  });

  const load = useCallback(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => { setProjects([]); toast.error("Chargement des projets impossible."); });
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (search.get("new") === "1") setOpenNew(true); }, [search]);

  async function createProject() {
    if (!form.name.trim()) { toast.error("Le nom du projet est requis."); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success("Projet créé.");
      setOpenNew(false);
      setProject({
        id: d.project.id, name: d.project.name, reference: d.project.reference,
        type: d.project.type, jurisdiction: d.project.jurisdiction,
        currency: d.project.currency, vatRate: d.project.vatRate, status: d.project.status,
      });
      router.push(`/projets/${d.project.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Création impossible.");
    } finally {
      setCreating(false);
    }
  }

  function activate(p: ProjectRow) {
    setProject({
      id: p.id, name: p.name, reference: p.reference, type: p.type,
      jurisdiction: p.jurisdiction, currency: p.currency, vatRate: p.vatRate, status: p.status,
    });
    toast.success(`Projet actif : ${p.name}`);
  }

  const input = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Pilotage"
        title="Projets"
        accent="dossiers de consultation"
        description="Chaque projet relie ses pièces sources, ses CCTP, ses DPGF et ses sous-détails. Activez un projet pour le retrouver dans tous les agents."
      />

      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {projects ? `${projects.length} projet(s)` : "Chargement…"}
        </p>
        <Button variant="gold" onClick={() => setOpenNew(true)}>
          <Plus className="size-4" /> Nouveau projet
        </Button>
      </div>

      {projects === null ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Aucun projet"
          description="Créez votre premier projet pour relier plans, CCTP, DPGF et sous-détails dans un dossier unique."
          actions={<Button variant="gold" onClick={() => setOpenNew(true)}><Plus className="size-4" /> Nouveau projet</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const isActive = active?.id === p.id;
            return (
              <Card
                key={p.id}
                className={cn(
                  "group relative overflow-hidden transition-shadow hover:shadow-card-hover",
                  isActive && "ring-2 ring-gold-400",
                )}
              >
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/projets/${p.id}`} className="min-w-0">
                      <h3 className="truncate font-display text-lg font-semibold text-navy-900 group-hover:text-navy-700">
                        {p.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {[p.reference, p.type, p.client?.name].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </Link>
                    <Badge variant={p.status === "ARCHIVE" ? "muted" : p.status === "EN_COURS" ? "default" : "gold"}>
                      {statusLabel(p.status)}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {p.location ? <span className="flex items-center gap-1"><MapPin className="size-3" /> {p.location}</span> : null}
                    <span className="rounded-full bg-navy-50 px-2 py-0.5 font-semibold text-navy-700">{p.jurisdiction}</span>
                    {p.currency ? <span className="font-semibold">{p.currency}</span> : null}
                  </div>

                  <div className="flex items-center gap-4 border-t border-border/60 pt-3 text-xs">
                    <span className="flex items-center gap-1.5 text-navy-700">
                      <FileText className="size-3.5 text-navy-500" /> {p._count.cctps} CCTP
                    </span>
                    <span className="flex items-center gap-1.5 text-navy-700">
                      <Table2 className="size-3.5 text-navy-500" /> {p._count.dpgfs} DPGF
                    </span>
                    {p._count.issues > 0 && (
                      <span className="flex items-center gap-1 text-warning-foreground">
                        <AlertTriangle className="size-3.5" /> {p._count.issues}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-1.5">
                      <Button
                        variant={isActive ? "outline" : "ghost"}
                        size="sm"
                        onClick={() => activate(p)}
                        title={isActive ? "Projet actif" : "Définir comme projet actif"}
                      >
                        <CheckCircle2 className={cn("size-4", isActive ? "text-success" : "text-muted-foreground/50")} />
                        {isActive ? "Actif" : "Activer"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => router.push(`/projets/${p.id}`)}>Ouvrir</Button>
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Création */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouveau projet</DialogTitle>
            <DialogDescription>
              Le projet devient le pivot : pièces importées, CCTP, DPGF et sous-détails y seront rattachés.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Nom du projet *</Label>
              <input className={input} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex : Immeuble collectif de 11 logements — Ferrières" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Référence</Label>
                <input className={input} value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Ex : 2026-014" />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select className={input} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Localisation</Label>
              <input className={input} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Ville, adresse…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Juridiction</Label>
                <select className={input} value={form.jurisdiction} onChange={(e) => setForm((f) => ({ ...f, jurisdiction: e.target.value }))}>
                  {JURISDICTIONS.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  {JURISDICTIONS.find((j) => j.value === form.jurisdiction)?.refs}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Devise</Label>
                <select className={input} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                  <option value="MAD">MAD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Annuler</Button>
            <Button variant="gold" disabled={creating} onClick={createProject}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Créer le projet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
