"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, FolderPlus } from "lucide-react";

interface ClientOpt { id: string; name: string }

/** Encode des octets en base64 (par tranches, pour éviter le débordement d'argument). */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/**
 * Bouton « Enregistrer dans une fiche client » : produit le PDF (via `build`)
 * et l'attache au client choisi (catégorie = type de document). Permet le suivi
 * d'affaire de bout en bout (CCTP/DPGF/Devis/Sous-détail rattachés au client).
 */
export function SaveToClient({
  category,
  filename,
  build,
  disabled,
  defaultClientId,
}: {
  category: string;
  filename: string;
  build: () => Promise<Uint8Array>;
  disabled?: boolean;
  /** Pré-sélectionne ce client (ex: client déjà choisi sur le devis). */
  defaultClientId?: string;
}) {
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => setClients((d.clients ?? []).map((c: ClientOpt) => ({ id: c.id, name: c.name }))))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Suit la pré-sélection fournie par la page (client choisi sur le devis).
  useEffect(() => { if (defaultClientId) setClientId(defaultClientId); }, [defaultClientId]);

  async function save() {
    if (!clientId) { toast.error("Choisissez un client."); return; }
    setSaving(true);
    try {
      const bytes = await build();
      const dataUrl = `data:application/pdf;base64,${bytesToBase64(bytes)}`;
      const r = await fetch(`/api/clients/${clientId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: filename, category, mimeType: "application/pdf", size: bytes.length, dataUrl }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const name = clients.find((c) => c.id === clientId)?.name ?? "client";
      toast.success(`Enregistré dans la fiche de ${name}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  if (loaded && clients.length === 0) return null; // aucun client : on masque

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-gold-300 bg-gold-50/40 px-2.5 py-1.5">
      <FolderPlus className="size-4 shrink-0 text-gold-600" />
      <select
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        className="h-8 max-w-[180px] rounded-md border border-input bg-card px-2 text-xs"
        disabled={disabled || saving}
      >
        <option value="">Rattacher à un client…</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <Button variant="outline" size="sm" disabled={disabled || saving || !clientId} onClick={save}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : <FolderPlus className="size-4" />} Enregistrer
      </Button>
    </div>
  );
}
