"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CLIENT_TYPES, CLIENT_STATUSES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Loader2, Save, Trash2, Upload, FileText, Download, FolderOpen, ReceiptText } from "lucide-react";

interface Doc { id: string; name: string; category?: string | null; mimeType?: string | null; size?: number | null; createdAt: string }
interface Client {
  id: string; name: string; type?: string | null; status: string; company?: string | null;
  ice?: string | null; contact?: string | null; address?: string | null; city?: string | null;
  region?: string | null; phone?: string | null; email?: string | null; website?: string | null; notes?: string | null;
  createdAt?: string;
  documents: Doc[];
  projects: { id: string; name: string; reference?: string | null; type?: string | null }[];
  quotes: { id: string; number: string; totalTTC: number; status: string; createdAt: string }[];
}

const DOC_CATS = ["Plan", "Document", "Photo", "Devis", "Autre"];
const MAX_FILE = 6 * 1024 * 1024;
const fmtSize = (n?: number | null) => (n ? (n > 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`) : "");

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCat, setUploadCat] = useState("Plan");
  const [form, setForm] = useState<Partial<Client>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/clients/${id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setClient(d.client);
      setForm(d.client);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement impossible");
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch(`/api/clients/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success("Fiche enregistrée.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally { setSaving(false); }
  }

  async function removeClient() {
    if (!confirm("Supprimer définitivement ce client et ses documents ?")) return;
    const r = await fetch(`/api/clients/${id}`, { method: "DELETE" });
    if (r.ok) { toast.success("Client supprimé."); router.push("/clients"); }
    else toast.error("Suppression impossible");
  }

  function readAsDataUrl(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.onerror = () => rej(new Error("Lecture du fichier impossible"));
      fr.readAsDataURL(file);
    });
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE) { toast.error(`${file.name} : trop volumineux (max 6 Mo).`); continue; }
        const dataUrl = await readAsDataUrl(file);
        const r = await fetch(`/api/clients/${id}/documents`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, category: uploadCat, mimeType: file.type, size: file.size, dataUrl }),
        });
        if (r.ok) ok++; else { const d = await r.json(); toast.error(`${file.name} : ${d.error || "échec"}`); }
      }
      if (ok > 0) { toast.success(`${ok} document(s) ajouté(s).`); await load(); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload impossible");
    } finally { setUploading(false); }
  }

  async function downloadDoc(doc: Doc) {
    try {
      const r = await fetch(`/api/clients/${id}/documents?docId=${doc.id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const a = document.createElement("a");
      a.href = d.document.dataUrl;
      a.download = doc.name;
      a.click();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Téléchargement impossible");
    }
  }

  async function deleteDoc(doc: Doc) {
    if (!confirm(`Supprimer « ${doc.name} » ?`)) return;
    const r = await fetch(`/api/clients/${id}/documents?docId=${doc.id}`, { method: "DELETE" });
    if (r.ok) { toast.success("Document supprimé."); await load(); }
    else toast.error("Suppression impossible");
  }

  if (loading) return <div className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="size-6 animate-spin" /></div>;
  if (!client) return (
    <div className="py-16 text-center">
      <p className="text-muted-foreground">Client introuvable.</p>
      <Button variant="outline" className="mt-4" asChild><Link href="/clients"><ArrowLeft className="size-4" /> Retour</Link></Button>
    </div>
  );

  const set = (k: keyof Client) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="animate-fade-up">
      <Link href="/clients" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-navy-800"><ArrowLeft className="size-4" /> Tous les clients</Link>
      <PageHeader eyebrow="Fiche client" title={client.name} accent={CLIENT_TYPES.find((t) => t.value === client.type)?.label ?? ""}
        description={`Enregistré le ${formatDate(client.createdAt ?? new Date())}`} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ── Coordonnées ── */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-navy-900">Coordonnées</CardTitle>
            <Badge variant="muted">{CLIENT_STATUSES.find((s) => s.value === client.status)?.label}</Badge>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>Nom / raison sociale</Label><Input value={form.name ?? ""} onChange={set("name")} /></div>
            <div className="space-y-1.5"><Label>Métier</Label>
              <select value={form.type ?? ""} onChange={set("type")} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
                <option value="">—</option>
                {CLIENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Statut</Label>
              <select value={form.status ?? "PROSPECT"} onChange={set("status")} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
                {CLIENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Contact (personne)</Label><Input value={form.contact ?? ""} onChange={set("contact")} /></div>
            <div className="space-y-1.5"><Label>Société / groupe</Label><Input value={form.company ?? ""} onChange={set("company")} /></div>
            <div className="space-y-1.5"><Label>Téléphone</Label><Input value={form.phone ?? ""} onChange={set("phone")} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={form.email ?? ""} onChange={set("email")} /></div>
            <div className="space-y-1.5"><Label>Adresse</Label><Input value={form.address ?? ""} onChange={set("address")} /></div>
            <div className="space-y-1.5"><Label>Ville</Label><Input value={form.city ?? ""} onChange={set("city")} /></div>
            <div className="space-y-1.5"><Label>Région / pays</Label><Input value={form.region ?? ""} onChange={set("region")} /></div>
            <div className="space-y-1.5"><Label>Site web</Label><Input value={form.website ?? ""} onChange={set("website")} /></div>
            <div className="space-y-1.5"><Label>ICE / SIRET</Label><Input value={form.ice ?? ""} onChange={set("ice")} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea value={form.notes ?? ""} onChange={set("notes")} placeholder="Historique, besoins, contexte du prospect…" className="min-h-[90px]" /></div>
            <div className="flex items-center justify-between sm:col-span-2">
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={removeClient}><Trash2 className="size-4" /> Supprimer</Button>
              <Button variant="gold" disabled={saving} onClick={save}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Enregistrer</Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Documents & plans ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-navy-900"><FolderOpen className="size-4 text-gold-600" /> Plans & documents</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <select value={uploadCat} onChange={(e) => setUploadCat(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
                  {DOC_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <label className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm font-medium hover:border-gold-400 ${uploading ? "pointer-events-none opacity-60" : ""}`}>
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Ajouter un fichier
                  <input type="file" multiple hidden onChange={(e) => { uploadFiles(e.target.files); e.currentTarget.value = ""; }} />
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">PDF, images, plans, documents… (max 6 Mo par fichier).</p>
              {client.documents.length === 0 ? (
                <p className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">Aucun document. Ajoutez les plans et pièces du client.</p>
              ) : (
                <ul className="space-y-1.5">
                  {client.documents.map((doc) => (
                    <li key={doc.id} className="flex items-center gap-2 rounded-md border border-border/70 px-2.5 py-2 text-sm">
                      <FileText className="size-4 shrink-0 text-navy-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-navy-800">{doc.name}</p>
                        <p className="text-[11px] text-muted-foreground">{doc.category}{doc.size ? ` · ${fmtSize(doc.size)}` : ""} · {formatDate(doc.createdAt)}</p>
                      </div>
                      <button onClick={() => downloadDoc(doc)} title="Télécharger" className="text-muted-foreground hover:text-navy-800"><Download className="size-4" /></button>
                      <button onClick={() => deleteDoc(doc)} title="Supprimer" className="text-muted-foreground/60 hover:text-destructive"><Trash2 className="size-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {(client.projects.length > 0 || client.quotes.length > 0) && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-navy-900"><ReceiptText className="size-4 text-gold-600" /> Affaires liées</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {client.projects.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2">
                    <span className="text-navy-800">{p.name}</span><span className="text-xs text-muted-foreground">{p.type || "Projet"}</span>
                  </div>
                ))}
                {client.quotes.map((q) => (
                  <div key={q.id} className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2">
                    <span className="text-navy-800">{q.number}</span><Badge variant="muted">{q.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
