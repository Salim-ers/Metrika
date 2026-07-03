"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepDef {
  key: string;
  label: string;
  description?: string;
}

export interface StepperProps {
  steps: StepDef[];
  /** Clé de l'étape courante. */
  current: string;
  /** Clés des étapes déjà accomplies. */
  done?: string[];
  /** Si fourni, les étapes faites / courante deviennent cliquables. */
  onStepClick?: (key: string) => void;
  className?: string;
}

/**
 * Progress stepper horizontal premium Metrika : cercles numérotés reliés par
 * des lignes — fait = gold + Check, courant = navy cerclé d'or, à venir = muted.
 */
export function Stepper({ steps, current, done = [], onStepClick, className }: StepperProps) {
  const doneSet = React.useMemo(() => new Set(done), [done]);

  return (
    <nav aria-label="Étapes" className={cn("w-full", className)}>
      <ol className="flex items-start">
        {steps.map((step, index) => {
          const isDone = doneSet.has(step.key);
          const isCurrent = step.key === current;
          const isClickable = !!onStepClick && (isDone || isCurrent);
          const prevDone = index > 0 && doneSet.has(steps[index - 1].key);

          const circle = (
            <span
              aria-hidden="true"
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors duration-200",
                isDone && "border-gold-500 bg-gold-500 text-navy-900",
                isCurrent &&
                  "border-navy-700 bg-navy-700 text-white ring-2 ring-gold-500/70 ring-offset-2 ring-offset-background dark:border-navy-500 dark:bg-navy-600",
                !isDone && !isCurrent && "border-border bg-muted text-muted-foreground"
              )}
            >
              {isDone ? <Check className="size-4" strokeWidth={3} /> : index + 1}
            </span>
          );

          const labels = (
            <>
              <span
                className={cn(
                  "mt-2 max-w-[9rem] text-xs leading-tight",
                  isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
              {step.description && (
                <span className="mt-0.5 hidden max-w-[11rem] text-[11px] leading-tight text-muted-foreground/80 md:block">
                  {step.description}
                </span>
              )}
            </>
          );

          return (
            <li
              key={step.key}
              aria-current={isCurrent ? "step" : undefined}
              className="relative flex min-w-0 flex-1 flex-col items-center text-center"
            >
              {/* Ligne de liaison vers le cercle précédent */}
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-[calc(-50%+1.375rem)] right-[calc(50%+1.375rem)] top-4 h-px transition-colors duration-200",
                    prevDone ? "bg-gold-500" : "bg-border"
                  )}
                />
              )}

              {isClickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick?.(step.key)}
                  className="group flex flex-col items-center rounded-md px-1 pb-1 outline-none transition-opacity duration-200 hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={isDone ? `Revenir à l'étape ${index + 1} : ${step.label}` : `Étape ${index + 1} : ${step.label}`}
                >
                  {circle}
                  {labels}
                </button>
              ) : (
                <div className="flex flex-col items-center px-1 pb-1">
                  {circle}
                  {labels}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
