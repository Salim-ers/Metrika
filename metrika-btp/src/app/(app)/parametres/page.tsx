"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
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
  ice: string; rc: string; ifNumber: string; cnss: string; patente: string;
  address: string; city: string; phone: string; email: string; website: string;
  bankName: string; rib: string; iban: string; swift: string;
  vatRate: number; quotePrefix: string; paymentTerms: string;
  logoUrl: string; stampUrl: string;
}

const initial: CompanyForm = {
  name: "", legalForm: "SARL", capital: "",
  ice: "", rc: "", ifNumber: "", cnss: "", patente: "",
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
    if (file.size > 1_500_000) { toast.error("Image trop lourde (max ~1,5 Mo)."); return; }
    const dataUrl = await fileToDataUrl(file);
    setForm((f) => ({ ...f, [k]: dataUrl }));
    toast.success("Image chargée. Pensez à enregistrer.");
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
      toast.success("Fiche entreprise enregistrée. Le logo apparaîtra sur vos documents.");
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
            <Field label="Forme juridique"><Input value={form.legalForm} onChange={set("legalForm")} placeholder="SARL, SA…" /></Field>
            <Field label="Capital social"><Input value={form.capital} onChange={set("capital")} placeholder="Ex : 100 000 MAD" /></Field>
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
              <CardTitle className="text-navy-900">Informations légales (Maroc)</CardTitle>
            </div>
            <CardDescription>Identifiants obligatoires sur les documents officiels.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="ICE"><Input value={form.ice} onChange={set("ice")} placeholder="Identifiant Commun de l’Entreprise" /></Field>
            <Field label="RC"><Input value={form.rc} onChange={set("rc")} placeholder="Registre de Commerce" /></Field>
            <Field label="IF"><Input value={form.ifNumber} onChange={set("ifNumber")} placeholder="Identifiant Fiscal" /></Field>
            <Field label="CNSS"><Input value={form.cnss} onChange={set("cnss")} placeholder="N° CNSS" /></Field>
            <Field label="Patente"><Input value={form.patente} onChange={set("patente")} placeholder="Taxe professionnelle" /></Field>
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
                    <Image src={form.logoUrl} alt="logo" width={96} height={48} unoptimized className="h-12 w-auto rounded border border-border bg-white object-contain p-1" />
                  ) : (
                    <div className="flex h-12 w-24 items-center justify-center rounded border border-dashed border-border text-[10px] text-muted-foreground">Aucun logo</div>
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium hover:border-gold-400">
                    <Upload className="size-4" /> Téléverser
                    <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => uploadImage("logoUrl", e.target.files?.[0])} />
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
                    <Image src={form.stampUrl} alt="cachet" width={64} height={64} unoptimized className="h-12 w-12 rounded border border-border bg-white object-contain p-1" />
                  ) : (
                    <div className="flex h-12 w-24 items-center justify-center rounded border border-dashed border-border text-[10px] text-muted-foreground">Aucun cachet</div>
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium hover:border-gold-400">
                    <Upload className="size-4" /> Téléverser
                    <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => uploadImage("stampUrl", e.target.files?.[0])} />
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
