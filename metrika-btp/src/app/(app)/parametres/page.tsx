"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Building2, Save, Upload, Landmark, ScrollText, Phone } from "lucide-react";

interface CompanyForm {
  name: string; legalForm: string; capital: string;
  country: string; currency: string;
  ice: string; rc: string; ifNumber: string; cnss: string; patente: string;
  siret: string; vatNumber: string; ape: string;
  address: string; city: string; phone: string; email: string; website: string;
  bankName: string; rib: string; iban: string; swift: string;
  vatRate: number; quotePrefix: string; paymentTerms: string;
  logoUrl: string; stampUrl: string;
}

const initial: CompanyForm = {
  name: "", legalForm: "SARL", capital: "",
  country: "Maroc", currency: "MAD",
  ice: "", rc: "", ifNumber: "", cnss: "", patente: "",
  siret: "", vatNumber: "", ape: "",
  address: "", city: "", phone: "", email: "", website: "",
  bankName: "", rib: "", iban: "", swift: "",
  vatRate: 20, quotePrefix: "DEV",
  paymentTerms: "Paiement à 30 jours par virement bancaire. Pas d’escompte pour paiement anticipé.",
  logoUrl: "", stampUrl: "",
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/**
 * Charge une image (PNG/JPG/WEBP/SVG), la redimensionne côté navigateur via
 * canvas et renvoie un PNG compact (transparence conservée). Évite les
 * data URL trop lourdes qui font échouer la sauvegarde et l'embarquement PDF.
 */
async function processImage(file: File, maxDim: number): Promise<string> {
  const src = await fileToDataUrl(file);
  const img = document.createElement("img");
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = src;
  });
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) throw new Error("Dimensions inconnues");
  const scale = Math.min(1, maxDim / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export default function ParametresPage() {
  const [form, setForm] = useState<CompanyForm>(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof CompanyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    fetch("/api/company")
      .then((r) => (r.ok ? r.json() : { company: null }))
      .then((d) => {
        if (d.company) {
          setForm((f) => ({
            ...f,
            ...Object.fromEntries(Object.entries(d.company).filter(([, v]) => v !== null && v !== undefined)),
          }));
        }
      })
      .catch(() => {});
  }, []);

  async function uploadImage(k: "logoUrl" | "stampUrl", file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await processImage(file, 700);
      setForm((f) => ({ ...f, [k]: dataUrl }));
      toast.success("Image chargée. Cliquez sur Enregistrer pour la conserver.");
    } catch {
      toast.error("Image illisible. Utilisez un fichier PNG ou JPG.");
    }
  }

  async function save() {
    if (!form.name.trim()) { toast.error("La raison sociale est requise."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Échec");
      const d = await res.json().catch(() => ({}));
      const { setCompanyCache } = await import("@/lib/client-data");
      setCompanyCache(d.company ?? null);
      toast.success("Fiche entreprise enregistrée. Logo, devise et mentions sont appliqués à tous vos documents.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Organisation"
        title="Paramètres"
        accent="entreprise"
        description="Ces informations alimentent l’en-tête, les mentions légales et le pied de page de tous vos documents officiels."
        action={<Button variant="gold" disabled={saving} onClick={save}><Save className="size-4" /> {saving ? "Enregistrement…" : "Enregistrer"}</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Identité */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="size-5 text-gold-500" />
              <CardTitle className="text-navy-900">Identité</CardTitle>
            </div>
            <CardDescription>Raison sociale et forme juridique.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Raison sociale"><Input value={form.name} onChange={set("name")} placeholder="Nom de l’entreprise" /></Field></div>
            <Field label="Forme juridique"><Input value={form.legalForm} onChange={set("legalForm")} placeholder="SARL, SA, SAS…" /></Field>
            <Field label="Capital social"><Input value={form.capital} onChange={set("capital")} placeholder="Ex : 100 000" /></Field>
            <Field label="Pays">
              <select value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                <option>Maroc</option>
                <option>France</option>
                <option>International</option>
              </select>
            </Field>
            <Field label="Devise des documents">
              <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                <option value="MAD">Dirham marocain (MAD)</option>
                <option value="EUR">Euro (€)</option>
              </select>
            </Field>
          </CardContent>
        </Card>

        {/* Coordonnées */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Phone className="size-5 text-gold-500" />
              <CardTitle className="text-navy-900">Coordonnées</CardTitle>
            </div>
            <CardDescription>Adresse et contacts affichés sur les documents.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Adresse"><Input value={form.address} onChange={set("address")} placeholder="Adresse complète" /></Field></div>
            <Field label="Ville"><Input value={form.city} onChange={set("city")} placeholder="Casablanca…" /></Field>
            <Field label="Téléphone"><Input value={form.phone} onChange={set("phone")} placeholder="+212…" /></Field>
            <Field label="E-mail"><Input type="email" value={form.email} onChange={set("email")} placeholder="contact@…" /></Field>
            <Field label="Site web"><Input value={form.website} onChange={set("website")} placeholder="www…" /></Field>
          </CardContent>
        </Card>

        {/* Informations légales Maroc */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ScrollText className="size-5 text-gold-500" />
              <CardTitle className="text-navy-900">Informations légales</CardTitle>
            </div>
            <CardDescription>Renseignez les identifiants correspondant à votre pays — ils apparaissent en pied de tous les documents.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gold-600">Maroc</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ICE"><Input value={form.ice} onChange={set("ice")} placeholder="Identifiant Commun de l’Entreprise" /></Field>
              <Field label="RC"><Input value={form.rc} onChange={set("rc")} placeholder="Registre de Commerce" /></Field>
              <Field label="IF"><Input value={form.ifNumber} onChange={set("ifNumber")} placeholder="Identifiant Fiscal" /></Field>
              <Field label="CNSS"><Input value={form.cnss} onChange={set("cnss")} placeholder="N° CNSS" /></Field>
              <Field label="Patente"><Input value={form.patente} onChange={set("patente")} placeholder="Taxe professionnelle" /></Field>
            </div>
            <Separator />
            <p className="text-xs font-semibold uppercase tracking-wider text-gold-600">France</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SIRET"><Input value={form.siret} onChange={set("siret")} placeholder="N° SIRET (14 chiffres)" /></Field>
              <Field label="N° TVA intracommunautaire"><Input value={form.vatNumber} onChange={set("vatNumber")} placeholder="FR…" /></Field>
              <Field label="Code APE / NAF"><Input value={form.ape} onChange={set("ape")} placeholder="Ex : 4120A" /></Field>
            </div>
          </CardContent>
        </Card>

        {/* Bancaire */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Landmark className="size-5 text-gold-500" />
              <CardTitle className="text-navy-900">Coordonnées bancaires</CardTitle>
            </div>
            <CardDescription>Reprises dans le pied des devis.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Banque"><Input value={form.bankName} onChange={set("bankName")} placeholder="Nom de la banque" /></Field>
            <Field label="RIB"><Input value={form.rib} onChange={set("rib")} placeholder="Relevé d’identité bancaire" /></Field>
            <Field label="IBAN"><Input value={form.iban} onChange={set("iban")} placeholder="MA…" /></Field>
            <Field label="SWIFT / BIC"><Input value={form.swift} onChange={set("swift")} /></Field>
          </CardContent>
        </Card>

        {/* Réglages devis */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-navy-900">Réglages des devis & documents</CardTitle>
            <CardDescription>Paramètres par défaut appliqués aux générations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Taux de TVA (%)">
                <Input type="number" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: +e.target.value })} />
              </Field>
              <Field label="Préfixe de numérotation"><Input value={form.quotePrefix} onChange={set("quotePrefix")} placeholder="DEV" /></Field>
            </div>
            <Field label="Conditions de paiement">
              <Textarea value={form.paymentTerms} onChange={set("paymentTerms")} className="min-h-[100px]" />
            </Field>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Logo de l’entreprise</Label>
                <div className="flex items-center gap-3">
                  {form.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logoUrl} alt="logo" className="h-12 w-auto rounded border border-border bg-white object-contain p-1" />
                  ) : (
                    <div className="flex h-12 w-24 items-center justify-center rounded border border-dashed border-border text-[10px] text-muted-foreground">Aucun logo</div>
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium hover:border-gold-400">
                    <Upload className="size-4" /> Téléverser
                    <input type="file" accept="image/*" hidden onChange={(e) => { uploadImage("logoUrl", e.target.files?.[0]); e.currentTarget.value = ""; }} />
                  </label>
                  {form.logoUrl && (
                    <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, logoUrl: "" }))}>Retirer</Button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cachet / signature</Label>
                <div className="flex items-center gap-3">
                  {form.stampUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.stampUrl} alt="cachet" className="h-12 w-12 rounded border border-border bg-white object-contain p-1" />
                  ) : (
                    <div className="flex h-12 w-24 items-center justify-center rounded border border-dashed border-border text-[10px] text-muted-foreground">Aucun cachet</div>
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium hover:border-gold-400">
                    <Upload className="size-4" /> Téléverser
                    <input type="file" accept="image/*" hidden onChange={(e) => { uploadImage("stampUrl", e.target.files?.[0]); e.currentTarget.value = ""; }} />
                  </label>
                  {form.stampUrl && (
                    <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, stampUrl: "" }))}>Retirer</Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Note : à l’enregistrement, ces informations sont persistées dans le modèle <code>Company</code> (Prisma)
        et réutilisées automatiquement par les générateurs de CCTP, DPGF et devis.
      </p>
    </div>
  );
}
