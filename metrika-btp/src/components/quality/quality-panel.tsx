"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ShieldCheck, ChevronDown } from "lucide-react";
import type { FidelityScore } from "@/lib/fidelity";

/**
 * Panneau « Contrôle qualité » transverse (CCTP, DPGF, sous-détail).
 * Regroupe les points par famille : données manquantes, hypothèses,
 * incohérences, éléments sans source, éléments à valider.
 * Il SIGNALE — il ne corrige ni ne complète jamais à la place de l'humain.
 */
export interface QualityGroup {
  key: string;
  label: string;
  tone: "destructive" | "warning" | "gold" | "muted" | "default";
  items: { message: string; detail?: string }[];
}

export function QualityPanel({
  score,
  groups,
  title = "Contrôle qualité",
  className,
}: {
  score?: FidelityScore | null;
  groups: QualityGroup[];
  title?: string;
  className?: string;
}) {
  const nonEmpty = groups.filter((g) => g.items.length > 0);
  const total = nonEmpty.reduce((s, g) => s + g.items.length, 0);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});

  return (
    <Card className={cn(total > 0 ? "border-warning/40" : "border-success/30", className)}>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm text-navy-900">
          <ShieldCheck className={cn("size-4", total > 0 ? "text-warning-foreground" : "text-success")} />
          {title}
        </CardTitle>
        <div className="flex items-center gap-1.5">
          {score ? (
            <>
              <Badge variant={score.traceability >= 80 ? "success" : score.traceability >= 50 ? "warning" : "destructive"} title="Part des éléments avec source/statut explicite">
                Traçabilité {score.traceability}%
              </Badge>
              <Badge variant="muted" title="Part des éléments contractuels (confirmés/calculés)">
                Contractuel {score.contractual}%
              </Badge>
            </>
          ) : null}
          <Badge variant={total > 0 ? "warning" : "success"}>
            {total > 0 ? `${total} point(s)` : "Aucun point"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {nonEmpty.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucun point de contrôle en attente. La validation humaine reste requise avant export.
          </p>
        ) : (
          nonEmpty.map((g) => {
            const isOpen = open[g.key] ?? (g.tone === "destructive");
            return (
              <div key={g.key} className="overflow-hidden rounded-md border border-border/70">
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))}
                  className="flex w-full items-center justify-between gap-2 bg-muted/30 px-3 py-2 text-left text-xs font-semibold text-navy-800 hover:bg-muted/50"
                >
                  <span className="flex items-center gap-2">
                    <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                    {g.label}
                  </span>
                  <Badge variant={g.tone}>{g.items.length}</Badge>
                </button>
                {isOpen && (
                  <ul className="max-h-48 space-y-1 overflow-auto px-3 py-2 text-xs text-navy-800">
                    {g.items.slice(0, 40).map((it, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-current opacity-40" />
                        <span>
                          {it.message}
                          {it.detail ? <span className="block truncate text-[11px] italic text-muted-foreground">{it.detail}</span> : null}
                        </span>
                      </li>
                    ))}
                    {g.items.length > 40 ? <li className="text-muted-foreground">… +{g.items.length - 40} autre(s)</li> : null}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
