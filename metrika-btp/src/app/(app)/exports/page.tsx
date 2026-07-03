"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { FileDown } from "lucide-react";

interface ExportRow {
  id: string;
  docType: string;
  format: string;
  filename: string;
  status: string;
  createdAt: string;
  project?: { id: string; name: string } | null;
}

const DOC_LABELS: Record<string, string> = {
  CCTP: "CCTP", DPGF: "DPGF / CDPGF", SOUS_DETAIL: "Sous-détail",
  DEVIS: "Devis", AUDIT: "Audit", COMPARE: "Comparaison", TRADUCTION: "Traduction",
};

export default function ExportsPage() {
  const [rows, setRows] = useState<ExportRow[] | null>(null);

  useEffect(() => {
    fetch("/api/exports")
      .then((r) => r.json())
      .then((d) => setRows(d.exports ?? []))
      .catch(() => { setRows([]); toast.error("Chargement de l’historique impossible."); });
  }, []);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Production"
        title="Exports"
        accent="historique"
        description="Chaque export (PDF, DOCX, XLSX) est journalisé avec son document d’origine et son projet. Les fichiers sont téléchargés sur votre poste au moment de l’export."
      />

      {rows === null ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileDown}
          title="Aucun export"
          description="Les exports réalisés depuis les agents CCTP, DPGF et Sous-détail apparaîtront ici."
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Document</th>
                  <th className="px-4 py-2.5">Fichier</th>
                  <th className="px-4 py-2.5">Projet</th>
                  <th className="px-4 py-2.5">Format</th>
                  <th className="px-4 py-2.5">Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b border-border/60 hover:bg-muted/20">
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-navy-800">{DOC_LABELS[e.docType] ?? e.docType}</td>
                    <td className="max-w-[280px] truncate px-4 py-2.5 text-navy-700">{e.filename}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{e.project?.name ?? "—"}</td>
                    <td className="px-4 py-2.5"><Badge variant={e.format === "PDF" ? "default" : e.format === "XLSX" ? "success" : "muted"}>{e.format}</Badge></td>
                    <td className="px-4 py-2.5"><Badge variant={e.status === "DONE" ? "success" : "warning"}>{e.status === "DONE" ? "Terminé" : e.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
