import Link from "next/link";
import { FileStack, FileText, Table2, Calculator } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const AGENTS = [
  { href: "/agents/pdf", icon: FileStack, n: "n°1", title: "PDF & Images", desc: "Fusion, réorganisation, conversion d’images et optimisation de PDF.", status: "Opérationnel", variant: "success" as const },
  { href: "/agents/cctp", icon: FileText, n: "n°2", title: "Générateur de CCTP", desc: "Cahiers des clauses techniques structurés par lot, éditables avant export.", status: "Opérationnel", variant: "success" as const },
  { href: "/agents/dpgf", icon: Table2, n: "n°3", title: "Conversion CCTP → DPGF", desc: "Extraction d’ouvrages et proposition de quantités, validation ligne par ligne.", status: "Opérationnel", variant: "success" as const },
  { href: "/agents/sous-detail", icon: Calculator, n: "n°4", title: "Sous-détail de prix", desc: "Décomposition main-d’œuvre, matériaux, matériel et prix de vente.", status: "Opérationnel", variant: "success" as const },
];

export default function AgentsPage() {
  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Agents IA"
        title="Vos agents"
        accent="documentaires."
        description="Quatre agents spécialisés pilotent l’ensemble de votre chaîne documentaire BTP."
      />
      <div className="grid gap-5 sm:grid-cols-2">
        {AGENTS.map((a) => {
          const Icon = a.icon;
          return (
            <Link key={a.href} href={a.href}>
              <Card className="group h-full p-6 transition-shadow hover:shadow-card-hover">
                <div className="flex items-start justify-between">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-navy-700 text-white transition-colors group-hover:bg-gold-500 group-hover:text-navy-900">
                    <Icon className="size-5" />
                  </span>
                  <Badge variant={a.variant}>{a.status}</Badge>
                </div>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-gold-600">Agent {a.n}</p>
                <h3 className="mt-1 font-display text-xl font-semibold text-navy-900">{a.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{a.desc}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
