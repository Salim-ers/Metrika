"use client";

import * as React from "react";
import {
  BookOpen,
  CircleHelp,
  FileCheck2,
  FileText,
  Map as MapIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sourceLevel } from "@/lib/fidelity";

export interface SourceChipProps {
  /** Nom / type de la pièce source (cdpgf, cctp, plan, rapport, métier…). */
  source?: string | null;
  /** Extrait justificatif — affiché en info-bulle native (title). */
  excerpt?: string | null;
  /** Page de la pièce source (« p.X »). */
  page?: string | number | null;
  /** Si fourni, le chip devient un bouton (ouvrir la source / l'extrait). */
  onOpen?: () => void;
  className?: string;
}

/** Icône lucide selon le niveau de hiérarchie de la source (fidelity.ts). */
function levelIcon(level: number): LucideIcon {
  if (level <= 2) return FileCheck2; // CDPGF / CCTP officiels
  if (level === 3) return MapIcon; // plans, coupes, façades
  if (level === 4) return FileText; // rapports, notices, annexes
  if (level === 5) return BookOpen; // règles métier (non contractuel)
  return CircleHelp; // sans source / inconnue
}

/** Teinte selon le niveau : 1-2 success, 3-4 navy, 5 gold, inconnu muted. */
function levelTint(level: number): string {
  if (level <= 2) return "border-success/30 bg-success/10 text-success";
  if (level <= 4)
    return "border-navy-200 bg-navy-50 text-navy-700 dark:border-navy-500/40 dark:bg-navy-500/20 dark:text-navy-100";
  if (level === 5)
    return "border-gold-300 bg-gold-100 text-gold-800 dark:border-gold-500/40 dark:bg-gold-500/15 dark:text-gold-300";
  return "border-border bg-muted text-muted-foreground";
}

/**
 * Chip de provenance d'une donnée : hiérarchie des sources Metrika
 * (1-2 contractuel fort, 3-4 pièces techniques, 5 non contractuel).
 */
export function SourceChip({ source, excerpt, page, onOpen, className }: SourceChipProps) {
  const label = source?.trim() || "Sans source";
  const level = sourceLevel(source ?? undefined);
  const Icon = levelIcon(level);
  const hasPage = page != null && String(page).trim().length > 0;

  const chipClasses = cn(
    "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors duration-200",
    levelTint(level),
    onOpen &&
      "cursor-pointer hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    className
  );

  const content = (
    <>
      <Icon aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
      {hasPage && <span className="tabular-nums opacity-70">p.{page}</span>}
    </>
  );

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        title={excerpt ?? undefined}
        aria-label={excerpt ? `Source ${label} — ouvrir l'extrait` : `Source ${label} — ouvrir`}
        className={chipClasses}
      >
        {content}
      </button>
    );
  }

  return (
    <span title={excerpt ?? undefined} className={chipClasses}>
      {content}
    </span>
  );
}

export interface SourceChipItem {
  source?: string | null;
  excerpt?: string | null;
  page?: string | number | null;
  onOpen?: () => void;
}

/** Rangée de chips de provenance (wrap, gap-1). */
export function SourceChips({ items, className }: { items: SourceChipItem[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {items.map((item, i) => (
        <SourceChip key={`${item.source ?? "sans-source"}-${i}`} {...item} />
      ))}
    </div>
  );
}
