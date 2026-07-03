"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useProject } from "@/lib/use-project";
import { ACTOR_ROLES, type ActorRole } from "@/lib/fidelity";
import { PROJECT_STATUSES, JURISDICTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  FileText, Table2, Calculator, AlertTriangle, Users, Plus, CheckCircle2,
  FileDown, Trash2, Loader2, ArrowRight, FolderKanban,
} from "lucide-react";

interface ActorRow { id?: string; role: string; value: string; sourceFile?: string | null; sourcePage?: string | null; confidence: string; status: string }
interface ProjectDetail {
  id: string; name: string; reference?: string | null; type?: string | null;
  location?: string | null; description?: string | null; status: string;
  jurisdiction: string; currency?: string | null; vatRate?: number | null;
  client?: { id: string; name: string } | null;
  actors: ActorRow[];
  cctps: { id: string; title: string; status: string; mode: string; jurisdiction: string; version: number; indice: string; updatedAt: string; _count: { sections: number } }[];
  dpgfs: { id: string; title: string; status: string; mode: string; provisional: boolean; currency?: string | null; version: number; indice: string; updatedAt: string; cctpId?: string | null; _count: { lines: number } }[];
  issues: { id: string; severity: string; kind: string; message: string; docType: string; createdAt: string }[];
  exports: { id: string; docType: string; format: string; filename: string; createdAt: string }[];
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export default function ProjetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { project: active, setProject, clearProject } = useProject();
  const [p, setP] = useState<ProjectDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [savingActors, setSavingActors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/projects/${id}`)
      .then(async (r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => { if (d?.project) setP(d.project); })
      .catch(() => toast.error("Chargement du projet impossible."));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function activate() {
    if (!p) return;
    setProject({
      id: p.id, name: p.name, reference: p.reference, type: p.type,
      jurisdiction: p.jurisdiction, currency: p.currency, vatRate: p.vatRate, status: p.status,
    });
    toast.success(`Projet actif : ${p.name}`);
  }

  function updateActor(i: number, patch: Partial<ActorRow>) {
    setP((prev) => prev ? { ...prev, actors: prev.actors.map((a, j) => (j === i ? { ...a, ...patch } : a)) } : prev);
  }

  async function saveActors() {
    if (!p) return;
    setSavingActors(true);
    try {
      const res = await fetch(`/api/projects/${id}/actors`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actors: p.actors }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setP((prev) => prev ? { ...prev, actors: d.actors } : prev);
      toast.success("Table des intervenants enregistrée.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSavingActors(false);
    }
  }

  async function changeStatus(status: string) {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) { load(); toast.success("Statut mis à jour."); }
  }

  async function deleteProject() {
    setDeleting(true);
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (active?.id === id) clearProject();
      toast.success("Projet supprimé.");
      router.push("/projets");
    } finally {
      setDeleting(false);
    }
  }

  if (notFound) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Projet introuvable"
        description="Ce projet a peut-être été supprimé."
        actions={<Button variant="outline" onClick={() => router.push("/projets")}>Retour aux projets</Button>}
      />
    );
  }
  if (!p) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const isActive = active?.id === p.id;
  const juri = JURISDICTIONS.find((j) => j.value === p.jurisdiction);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={[p.reference, p.type].filter(Boolean).join(" · ") || "Projet"}
        title={p.name}
        accent={p.location ?? undefined}
        description={p.description ?? undefined}
      />

      {/* Barre de contexte + actions principales */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant="default">{p.jurisdiction}{juri ? ` — ${juri.refs}` : ""}</Badge>
        {p.currency && <Badge variant="muted">Devise : {p.currency}</Badge>}
        <select
          value={p.status}
          onChange={(e) => changeStatus(e.target.value)}
          className="h-8 rounded-md border border-input bg-card px-2 text-xs font-medium text-navy-800"
          title="Statut du projet"
        >
          {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <Button variant={isActive ? "outline" : "gold"} size="sm" onClick={activate}>
          <CheckCircle2 className={cn("size-4", isActive && "text-success")} /> {isActive ? "Projet actif" : "Définir comme projet actif"}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push(`/agents/cctp?projectId=${p.id}`)}>
            <FileText className="size-4" /> Générer un CCTP
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push(`/agents/dpgf?projectId=${p.id}`)}>
            <Table2 className="size-4" /> Générer un DPGF
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Colonne documents */}
        <div className="space-y-5 xl:col-span-2">
          {/* CCTP */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-navy-900"><FileText className="size-4 text-navy-600" /> CCTP ({p.cctps.length})</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => router.push(`/agents/cctp?projectId=${p.id}`)}>
                <Plus className="size-4" /> Nouveau
              </Button>
            </CardHeader>
            <CardContent>
              {p.cctps.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Aucun CCTP. Générez le premier depuis l’agent CCTP.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {p.cctps.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Link href={`/agents/cctp?id=${c.id}`} className="block truncate text-sm font-medium text-navy-800 hover:text-gold-700">
                          {c.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          v{c.version} · indice {c.indice} · {c._count.sections} lot(s) · {fmtDate(c.updatedAt)}
                        </p>
                      </div>
                      <StatusBadge status={c.status} />
                      <Button variant="ghost" size="sm" title="Générer le DPGF depuis ce CCTP" onClick={() => router.push(`/agents/dpgf?cctpId=${c.id}`)}>
                        DPGF <ArrowRight className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* DPGF */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-navy-900"><Table2 className="size-4 text-navy-600" /> DPGF / CDPGF ({p.dpgfs.length})</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => router.push(`/agents/dpgf?projectId=${p.id}`)}>
                <Plus className="size-4" /> Nouveau
              </Button>
            </CardHeader>
            <CardContent>
              {p.dpgfs.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Aucun DPGF. Générez-en un depuis un CCTP sauvegardé.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {p.dpgfs.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Link href={`/agents/dpgf?id=${d.id}`} className="block truncate text-sm font-medium text-navy-800 hover:text-gold-700">
                          {d.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {d.mode === "cdpgf" ? "CDPGF (chiffré)" : "DPGF (métré)"} · {d.provisional ? "provisoire" : "cadre officiel"} · {d._count.lines} ligne(s) · v{d.version}-{d.indice} · {fmtDate(d.updatedAt)}
                        </p>
                      </div>
                      <StatusBadge status={d.status} />
                      <Button variant="ghost" size="sm" title="Sous-détails des lignes" onClick={() => router.push(`/agents/sous-detail?dpgfId=${d.id}`)}>
                        <Calculator className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Intervenants */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-navy-900"><Users className="size-4 text-navy-600" /> Intervenants du projet</CardTitle>
              <Button variant="outline" size="sm" disabled={savingActors} onClick={saveActors}>
                {savingActors ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Enregistrer
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left uppercase tracking-wider text-muted-foreground">
                    <th className="pb-1.5 pr-2">Rôle</th>
                    <th className="pb-1.5 px-2">Intervenant</th>
                    <th className="pb-1.5 px-2">Source</th>
                    <th className="pb-1.5 pl-2">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {p.actors.map((a, i) => (
                    <tr key={a.role} className="border-b border-border/60">
                      <td className="py-1.5 pr-2 font-medium text-navy-800">
                        {ACTOR_ROLES[a.role as ActorRole]?.label ?? a.role}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={a.value}
                          onChange={(e) => updateActor(i, { value: e.target.value, status: e.target.value.trim() ? "confirmed" : "missing" })}
                          className="w-full rounded border border-input bg-card px-1.5 py-1 text-navy-800"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {[a.sourceFile, a.sourcePage ? `p.${a.sourcePage}` : ""].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="pl-2 py-1.5"><StatusBadge status={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Cette table fait autorité pour tous les documents du projet (page de garde CCTP, en-têtes). Un rôle non renseigné reste marqué « manquant » — jamais remplacé par un nom générique.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Colonne latérale : alertes + exports */}
        <div className="space-y-5">
          <Card className={cn(p.issues.length > 0 && "border-warning/40")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-navy-900">
                <AlertTriangle className={cn("size-4", p.issues.length ? "text-warning-foreground" : "text-muted-foreground")} />
                Points de contrôle ({p.issues.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {p.issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun point en attente.</p>
              ) : (
                <ul className="max-h-72 space-y-2 overflow-auto text-xs">
                  {p.issues.map((it) => (
                    <li key={it.id} className="rounded-md border border-border/60 bg-muted/20 p-2">
                      <div className="mb-1 flex items-center gap-1.5">
                        <Badge variant={it.severity === "bloquant" ? "destructive" : it.severity === "majeur" ? "warning" : "muted"}>
                          {it.severity}
                        </Badge>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{it.docType}</span>
                      </div>
                      <p className="text-navy-800">{it.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-navy-900"><FileDown className="size-4 text-navy-600" /> Derniers exports</CardTitle>
            </CardHeader>
            <CardContent>
              {p.exports.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun export pour ce projet.</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {p.exports.map((e) => (
                    <li key={e.id} className="flex items-center gap-2">
                      <Badge variant="muted">{e.format}</Badge>
                      <span className="min-w-0 flex-1 truncate text-navy-800">{e.filename}</span>
                      <span className="shrink-0 text-muted-foreground">{fmtDate(e.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/exports" className="mt-3 block text-xs font-medium text-gold-700 hover:underline">
                Voir tout l’historique →
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer ce projet ?"
        description={`« ${p.name} » sera supprimé. Les CCTP/DPGF rattachés seront détachés (non supprimés).`}
        confirmLabel="Supprimer le projet"
        busy={deleting}
        onConfirm={deleteProject}
      />
    </div>
  );
}
