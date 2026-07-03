import * as React from "react";
import { cn } from "@/lib/utils";
import { STATUS_META, isValidStatus } from "@/lib/fidelity";

/** Variants visuels du badge (tokens sémantiques + accents de marque). */
export type StatusBadgeVariant = "success" | "warning" | "muted" | "gold" | "default" | "destructive";

const VARIANT_CLASSES: Record<StatusBadgeVariant, { pill: string; dot: string }> = {
  success: {
    pill: "border-success/30 bg-success/10 text-success",
    dot: "bg-success",
  },
  warning: {
    pill: "border-warning/40 bg-warning/15 text-warning-foreground dark:text-warning",
    dot: "bg-warning",
  },
  muted: {
    pill: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  gold: {
    pill: "border-gold-300 bg-gold-100 text-gold-800 dark:border-gold-500/40 dark:bg-gold-500/15 dark:text-gold-300",
    dot: "bg-gold-500",
  },
  default: {
    pill: "border-navy-200 bg-navy-50 text-navy-700 dark:border-navy-500/40 dark:bg-navy-500/20 dark:text-navy-100",
    dot: "bg-navy-600 dark:bg-navy-300",
  },
  destructive: {
    pill: "border-destructive/30 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
};

/**
 * Statuts de cycle de vie DOCUMENT, en complément des DataStatus de
 * `@/lib/fidelity` (résolus via STATUS_META).
 */
const DOCUMENT_STATUS_META: Record<string, { label: string; variant: StatusBadgeVariant }> = {
  DRAFT: { label: "Brouillon", variant: "muted" },
  PENDING_REVIEW: { label: "À valider", variant: "warning" },
  VALIDATED: { label: "Validé · verrouillé", variant: "success" },
  GENERATED: { label: "Généré", variant: "default" },
  ARCHIVED: { label: "Archivé", variant: "muted" },
  EXPORTABLE: { label: "Exportable", variant: "gold" },
};

export interface StatusBadgeProps {
  /** DataStatus de fidelity.ts, statut DOCUMENT (DRAFT…), « exportable », ou texte libre. */
  status: string;
  /** Info-bulle native (ex. justification, source, date). */
  title?: string;
  className?: string;
}

/** Résout label + variant sans jamais jeter : statut inconnu → texte brut en muted. */
function resolveStatus(status: string): { label: string; variant: StatusBadgeVariant } {
  if (isValidStatus(status)) {
    const meta = STATUS_META[status];
    return { label: meta.label, variant: meta.variant };
  }
  const key = typeof status === "string" ? status.trim() : "";
  const doc = DOCUMENT_STATUS_META[key] ?? DOCUMENT_STATUS_META[key.toUpperCase()];
  if (doc) return doc;
  return { label: key || "—", variant: "muted" };
}

/**
 * Badge de statut de donnée / document Metrika : pastille colorée + libellé,
 * mappé sur STATUS_META (fidelity.ts) et les statuts de cycle de vie document.
 */
export function StatusBadge({ status, title, className }: StatusBadgeProps) {
  const { label, variant } = resolveStatus(status);
  const styles = VARIANT_CLASSES[variant];
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors duration-200",
        styles.pill,
        className
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", styles.dot)} />
      {label}
    </span>
  );
}
