"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { NAV } from "@/lib/constants";
import { CommandPalette, type CommandItem } from "@/components/ui/command-palette";

/** Actions rapides + navigation, exposées dans la palette (Ctrl/⌘ K). */
function buildItems(): CommandItem[] {
  const nav: CommandItem[] = NAV.flatMap((g) =>
    g.items.map((it) => ({ label: it.label, href: it.href, group: g.group })),
  );
  const actions: CommandItem[] = [
    { label: "Nouveau projet", href: "/projets?new=1", group: "Actions", keywords: "créer projet" },
    { label: "Générer un CCTP", href: "/agents/cctp", group: "Actions", keywords: "cahier clauses techniques" },
    { label: "Générer un DPGF depuis un CCTP", href: "/agents/dpgf", group: "Actions", keywords: "bordereau prix cdpgf" },
    { label: "Créer un sous-détail de prix", href: "/agents/sous-detail", group: "Actions", keywords: "déboursé sec" },
    { label: "Comparer CCTP et DPGF", href: "/agents/audit", group: "Actions", keywords: "audit écarts" },
    { label: "Historique des exports", href: "/exports", group: "Actions", keywords: "pdf docx xlsx téléchargements" },
  ];
  return [...actions, ...nav];
}

export function TopbarSearch() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative hidden h-10 max-w-md flex-1 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-gold-400 md:flex"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Rechercher une page, une action…</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          Ctrl K
        </kbd>
      </button>
      <CommandPalette items={buildItems()} open={open} onOpenChange={setOpen} />
    </>
  );
}
