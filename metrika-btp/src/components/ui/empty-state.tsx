import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** Icône lucide affichée dans un rond muted. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Zone d'actions (boutons fournis par le parent). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * État vide utile : carte en pointillés centrée, icône ronde, titre navy,
 * description muted et zone d'actions.
 */
export function EmptyState({ icon: Icon, title, description, actions, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center",
        className
      )}
    >
      {Icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          <Icon aria-hidden="true" className="size-6 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-base font-semibold text-navy-700 dark:text-foreground">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}
