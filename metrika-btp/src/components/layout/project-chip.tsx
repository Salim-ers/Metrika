"use client";

import Link from "next/link";
import { useProject } from "@/lib/use-project";
import { FolderKanban, ChevronRight } from "lucide-react";

/**
 * Chip du projet actif (topbar) — visible sur toutes les pages.
 * Affiche nom + juridiction + devise ; clic → sélection/gestion des projets.
 */
export function ProjectChip() {
  const { project } = useProject();

  return (
    <Link
      href="/projets"
      className="group flex max-w-[300px] items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-2.5 pr-2 text-sm transition-colors hover:border-gold-400"
      title={project ? `Projet actif : ${project.name}` : "Choisir un projet actif"}
    >
      <FolderKanban className="size-4 shrink-0 text-gold-600" />
      {project ? (
        <>
          <span className="truncate font-medium text-navy-800">{project.name}</span>
          <span className="hidden shrink-0 rounded-full bg-navy-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy-600 lg:block">
            {project.jurisdiction}
          </span>
          {project.currency ? (
            <span className="hidden shrink-0 text-[10px] font-semibold text-muted-foreground lg:block">{project.currency}</span>
          ) : null}
        </>
      ) : (
        <span className="text-muted-foreground">Aucun projet actif</span>
      )}
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
