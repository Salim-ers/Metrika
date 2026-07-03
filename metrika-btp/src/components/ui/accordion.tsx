"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AccordionProps {
  children: React.ReactNode;
  className?: string;
}

/** Conteneur simple : empile les AccordionItem avec un espacement vertical. */
export function Accordion({ children, className }: AccordionProps) {
  return <div className={cn("space-y-3", className)}>{children}</div>;
}

export interface AccordionItemProps {
  /** État contrôlé : le parent décide de l'ouverture. */
  open: boolean;
  onToggle: () => void;
  header: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Panneau dépliable contrôlé, sans Radix (non installé).
 * Dépliage fluide via grid-template-rows 0fr→1fr : aucune mesure de hauteur.
 * Accessible : aria-expanded / aria-controls / region étiquetée, contenu
 * replié inerte (non focusable).
 */
export function AccordionItem({
  open,
  onToggle,
  header,
  badge,
  children,
  className,
}: AccordionItemProps) {
  const id = React.useId();
  const headerId = `${id}-header`;
  const panelId = `${id}-panel`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card text-card-foreground shadow-card transition-shadow",
        open && "shadow-card-hover",
        className
      )}
    >
      <button
        type="button"
        id={headerId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1">{header}</span>
        {badge != null && <span className="shrink-0">{badge}</span>}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            role="region"
            id={panelId}
            aria-labelledby={headerId}
            aria-hidden={!open}
            inert={!open}
            className="border-t border-border px-4 py-3 text-sm"
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
