"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CLIENT_TYPES, CLIENT_STATUSES } from "@/lib/constants";
import { Users, Plus, Search, Loader2, Building2, FileText, ChevronRight, X } from "lucide-react";

interface ClientRow {
  id: string; name: string; type?: string | null; status: string;
  company?: string | null; city?: string | null; contact?: string | null;
  phone?: string | null; email?: string | null; createdAt: string;
  _count?: { documents: number; projects: number; quotes: number };
}

const typeLabel = (v?: string | null) => CLIENT_TYPES.find((t) => t.value === v)?.label ?? (v || "—");
const statusOf = (v: string) => CLIENT_STATUSES.find((s) => s.value === v) ?? CLIENT_STATUSES[0];
const statusVariant: Record<string, "success" | "warning" | "muted" | "gold"> = {
  PROSPECT: "gold", EN_COURS: "warning", CLIENT: "success", PERDU: "muted",
};

const emptyForm = { name: "", type: "ARCHITECTE", status: "PROSPECT", company: "", city: "", contact: "", phone: "", email: "" };

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/clients");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setClients(d.clients ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!form.name.trim()) { toast.error("Le nom du client est requis."); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/clients", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success("Client enregistré.");
      setForm(emptyForm); setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally { setSaving(false); }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (fType && c.type !== fType) return false;
      if (fStatus && c.status !== fStatus) return false;
      if (!q) return true;
      return [c.name, c.company, c.city, c.contact, c.email, c.phone]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [clients, search, fType, fStatus]);

  const stats = useMemo(() => ({
    total: clients.length,
    prospects: clients.filter((c) => c.status === "PROSPECT").length,
    actifs: clients.filter((c) => c.status === "CLIENT").length,
  }), [clients]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Relation client"
        title="Clients"
        accent="& prospects"
        description="Votre fichier clients : architectes, BET, économistes, promoteurs, entreprises… Centralisez coordonnées, plans et documents par client."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 py-4">
          <span className="flex size-10 items-center justify-center rounded-lg bg-navy-50 text-navy-700"><Users className="size-5" /></span>
          <div><p className="text-2xl font-semibold text-navy-900">{stats.total}</p><p className="text-xs text-muted-foreground">Contacts au total</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 py-4">
          <span className="flex size-10 items-center justify-center rounded-lg bg-gold-100 text-gold-700"><Building2 className="size-5" /></span>
          <div><p className="text-2xl font-semibold text-navy-900">{stats.prospects}</p><p className="text-xs text-muted-foreground">Prospects</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 py-4">
          <span className="flex size-10 items-center justify-center rounded-lg bg-success/10 text-success"><Users className="size-5" /></span>
          <div><p className="text-2xl font-semibold text-navy-900">{stats.actifs}</p><p className="text-xs text-muted-foreground">Clients actifs</p></div>
        </CardContent></Card>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un client, une ville, un email…" className="pl-9" />
        </div>
        <select value={fType} onChange={(e) => setFType(e.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm">
          <option value="">Tous les métiers</option>
          {CLIENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm">
          <option value="">Tous statuts</option>
          {CLIENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <Button variant="gold" onClick={() => setShowForm((v) => !v)}>
          {showForm ? <X className="size-4" /> : <Plus className="size-4" />} {showForm ? "Fermer" : "Nouveau client"}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-4 border-gold-200">
          <CardHeader><CardTitle className="text-navy-900">Nouveau client / prospect</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5"><Label>Nom / raison sociale *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cabinet, BET, société…" /></div>
            <div className="space-y-1.5"><Label>Métier</Label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
                {CLIENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Statut</Label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
                {CLIENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Contact (personne)</Label><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Nom du contact" /></div>
            <div className="space-y-1.5"><Label>Téléphone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Ville</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Société / groupe</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div className="flex items-end">
              <Button variant="gold" className="w-full" disabled={saving} onClick={create}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {clients.length === 0 ? "Aucun client pour l’instant. Cliquez sur « Nouveau client » pour commencer." : "Aucun client ne correspond à votre recherche."}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((c) => {
                const st = statusOf(c.status);
                return (
                  <Link key={c.id} href={`/clients/${c.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-navy-50 font-semibold text-navy-700">
                      {c.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-navy-900">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {typeLabel(c.type)}{c.city ? ` · ${c.city}` : ""}{c.contact ? ` · ${c.contact}` : ""}
                      </p>
                    </div>
                    {c._count && c._count.documents > 0 && (
                      <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                        <FileText className="size-3.5" /> {c._count.documents}
                      </span>
                    )}
                    <Badge variant={statusVariant[c.status] ?? "muted"}>{st.label}</Badge>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
