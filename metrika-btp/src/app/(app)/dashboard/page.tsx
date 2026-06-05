import { Suspense } from "react";
import { Users, FileText, Table2, ReceiptText, Activity, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/dashboard/stat-card";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ACTIONS = [
  { href: "/clients", label: "Nouveau client", primary: true },
  { href: "/devis", label: "Devis" },
  { href: "/agents/cctp", label: "CCTP" },
  { href: "/agents/dpgf", label: "DPGF" },
  { href: "/agents/sous-detail", label: "Sous-détail" },
  { href: "/agents/traduction", label: "Traduction PDF" },
  { href: "/agents/pdf", label: "PDF & Images" },
];

async function getData() {
  try {
    const [clientCount, cctpCount, dpgfCount, quoteCount, recentClients, treatments] = await Promise.all([
      prisma.client.count(),
      // Productions réellement enregistrées et rattachées à un client (suivi d'affaire).
      prisma.clientDocument.count({ where: { category: "CCTP" } }),
      prisma.clientDocument.count({ where: { category: "DPGF" } }),
      prisma.clientDocument.count({ where: { category: "Devis" } }),
      prisma.client.findMany({
        take: 6, orderBy: { createdAt: "desc" },
        select: { id: true, name: true, type: true, status: true, city: true, createdAt: true },
      }),
      prisma.treatment.findMany({ take: 5, orderBy: { createdAt: "desc" } }),
    ]);
    return { clientCount, cctpCount, dpgfCount, quoteCount, recentClients, treatments, ok: true };
  } catch {
    return { clientCount: 0, cctpCount: 0, dpgfCount: 0, quoteCount: 0, recentClients: [], treatments: [], ok: false };
  }
}

const CLIENT_TYPE_LABELS: Record<string, string> = {
  ARCHITECTE: "Architecte", BET: "Bureau d’études", ECONOMISTE: "Économiste",
  PROMOTEUR: "Promoteur", ENTREPRISE: "Entreprise", MOA: "Maître d’ouvrage",
  PARTICULIER: "Particulier", AUTRE: "Autre",
};

function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/60" />
      ))}
    </div>
  );
}

async function DashboardData() {
  const d = await getData();
  const chart = [
    { mois: "Jan", documents: 0 }, { mois: "Fév", documents: 0 }, { mois: "Mar", documents: 0 },
    { mois: "Avr", documents: 2 }, { mois: "Mai", documents: 5 }, { mois: "Juin", documents: d.quoteCount },
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Clients & prospects" value={d.clientCount} sub="fichier relation client" icon={Users} accent />
        <StatCard label="CCTP enregistrés" value={d.cctpCount} sub="rattachés à un client" icon={FileText} />
        <StatCard label="DPGF enregistrés" value={d.dpgfCount} sub="rattachés à un client" icon={Table2} />
        <StatCard label="Devis enregistrés" value={d.quoteCount} sub="rattachés à un client" icon={ReceiptText} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-navy-900">
                <Activity className="size-4 text-gold-500" /> Activité documentaire
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
          <CardTitle className="text-navy-900">Derniers clients & prospects</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link href="/clients">Tous les clients</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {d.recentClients.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun client pour l’instant. <Link href="/clients" className="text-gold-600 underline">Ajoutez votre premier client</Link>.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {d.recentClients.map((c) => (
                <Link key={c.id} href={`/clients/${c.id}`} className="flex items-center justify-between py-3 transition-colors hover:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-navy-50 font-semibold text-navy-600">
                      {c.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-navy-800">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {CLIENT_TYPE_LABELS[c.type ?? ""] ?? "Contact"}{c.city ? ` · ${c.city}` : ""} · {formatDate(c.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Badge variant={c.status === "CLIENT" ? "success" : c.status === "PERDU" ? "muted" : "gold"}>
                    {c.status === "CLIENT" ? "Client" : c.status === "EN_COURS" ? "En cours" : c.status === "PERDU" ? "Perdu" : "Prospect"}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function DashboardPage() {
  return (
    <div className="animate-fade-up">
      {/* Hero d'accueil — rendu instantanément */}
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 p-8 text-white shadow-card sm:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-gold-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 right-1/3 size-56 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300">Metrika · Métrage &amp; Chiffrage BTP</p>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight sm:text-4xl">
            Bonjour, prêt à <span className="italic text-gold-400">chiffrer</span> ?
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-navy-100/70">
            Pilotez vos cahiers techniques, décompositions de prix, sous-détails et devis —
            du métré au document officiel, aux couleurs de votre entreprise.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {ACTIONS.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className={
                  a.primary
                    ? "inline-flex items-center gap-1.5 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-900 transition-colors hover:bg-gold-400"
                    : "inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:border-gold-400/50 hover:bg-white/10"
                }
              >
                {a.label} {a.primary && <ArrowRight className="size-4" />}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Statistiques — diffusées dès qu'elles sont prêtes */}
      <Suspense fallback={<StatsSkeleton />}>
        <DashboardData />
      </Suspense>
    </div>
  );
}
