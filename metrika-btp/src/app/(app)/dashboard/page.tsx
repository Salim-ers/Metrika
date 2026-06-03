import { FileStack, FileText, Table2, ReceiptText, Bot, CheckCircle2, Clock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_MAP: Record<string, { label: string; variant: "success" | "warning" | "muted" | "gold" }> = {
  GENERATED: { label: "Généré", variant: "success" },
  VALIDATED: { label: "Validé", variant: "success" },
  PENDING_REVIEW: { label: "À valider", variant: "warning" },
  DRAFT: { label: "Brouillon", variant: "muted" },
  ARCHIVED: { label: "Archivé", variant: "muted" },
};

async function getData() {
  try {
    const [docCount, cctpCount, dpgfCount, quoteCount, recentDocs, treatments] = await Promise.all([
      prisma.document.count(),
      prisma.cctp.count(),
      prisma.dpgf.count(),
      prisma.quote.count(),
      prisma.document.findMany({ take: 6, orderBy: { createdAt: "desc" } }),
      prisma.treatment.findMany({ take: 5, orderBy: { createdAt: "desc" } }),
    ]);
    return { docCount, cctpCount, dpgfCount, quoteCount, recentDocs, treatments, ok: true };
  } catch {
    return { docCount: 0, cctpCount: 0, dpgfCount: 0, quoteCount: 0, recentDocs: [], treatments: [], ok: false };
  }
}

export default async function DashboardPage() {
  const d = await getData();
  // Données du graphique (placeholder : à brancher sur l'historique réel)
  const chart = [
    { mois: "Jan", documents: 0 }, { mois: "Fév", documents: 0 }, { mois: "Mar", documents: 0 },
    { mois: "Avr", documents: 2 }, { mois: "Mai", documents: 5 }, { mois: "Juin", documents: d.docCount },
  ];

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Pilotage"
        title="Votre"
        accent="tableau de bord."
        description="Vue d’ensemble de votre activité documentaire BTP — synchronisée en temps réel."
        action={
          <div className="flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-medium text-success">
            <span className="size-2 rounded-full bg-success" /> Synchro temps réel
          </div>
        }
      />

      {!d.ok && (
        <Card className="mb-6 border-warning/40 bg-warning/5">
          <CardContent className="py-4 text-sm text-navy-800">
            Base de données non connectée. Lancez <code className="rounded bg-muted px-1.5 py-0.5">npm run db:push</code> puis{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">npm run db:seed</code> pour activer les données réelles.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Documents générés" value={d.docCount} sub="tous types confondus" icon={FileStack} />
        <StatCard label="CCTP créés" value={d.cctpCount} sub="cahiers techniques" icon={FileText} />
        <StatCard label="DPGF produits" value={d.dpgfCount} sub="décompositions de prix" icon={Table2} />
        <StatCard label="Devis émis" value={d.quoteCount} sub="prêts à envoyer" icon={ReceiptText} accent />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-navy-900">
                <Bot className="size-4 text-gold-500" /> Activité documentaire
              </CardTitle>
              <p className="text-xs text-muted-foreground">6 derniers mois</p>
            </div>
          </CardHeader>
          <CardContent>
            <ActivityChart data={chart} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-navy-900">Statut des tâches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.treatments.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg bg-muted/50 py-10 text-center">
                <CheckCircle2 className="size-8 text-success" />
                <p className="mt-2 text-sm font-medium text-navy-800">Tout est sous contrôle</p>
                <p className="text-xs text-muted-foreground">Aucune tâche en attente.</p>
              </div>
            ) : (
              d.treatments.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <Clock className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-navy-800">{t.action}</p>
                      <p className="text-xs text-muted-foreground">{t.agent}</p>
                    </div>
                  </div>
                  <Badge variant="muted">{t.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-navy-900">Derniers documents</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link href="/agents">Tous les agents</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {d.recentDocs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun document pour l’instant. Commencez avec un agent IA.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {d.recentDocs.map((doc) => {
                const s = STATUS_MAP[doc.status] ?? STATUS_MAP.DRAFT;
                return (
                  <div key={doc.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-navy-50 text-navy-600">
                        <FileText className="size-4" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-navy-800">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(doc.createdAt)} · {doc.kind}</p>
                      </div>
                    </div>
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
