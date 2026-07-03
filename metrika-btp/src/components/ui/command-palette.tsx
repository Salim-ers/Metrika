"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CommandPaletteItem {
  label: string;
  /** Indication discrète affichée à droite (raccourci, contexte…). */
  hint?: string;
  href?: string;
  group?: string;
  /** Mots-clés supplémentaires pour la recherche. */
  keywords?: string;
  action?: () => void;
}

/** Alias court, pratique côté consommateurs. */
export type CommandItem = CommandPaletteItem;

export interface CommandPaletteProps {
  items: CommandPaletteItem[];
  /** Contrôle externe optionnel (sinon état interne + Ctrl/⌘ K). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const MAX_RESULTS = 12;

/** Diacritiques combinants Unicode (U+0300 → U+036F). */
const DIACRITICS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g"
);

/** Minuscules + suppression des accents (é→e) pour un filtrage tolérant. */
function normalize(s: string): string {
  return s.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

/**
 * Palette de commandes légère (sans cmdk) : Ctrl+K / ⌘K pour ouvrir,
 * recherche insensible aux accents, navigation clavier ↑/↓/Entrée.
 * Construite sur @radix-ui/react-dialog (focus trap, Échap, overlay).
 */
export function CommandPalette({ items, open: openProp, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const listboxId = React.useId();
  const [openState, setOpenState] = React.useState(false);
  // Mode contrôlé (open/onOpenChange fournis) ou autonome (Ctrl/⌘ K).
  const open = openProp ?? openState;
  const setOpen = React.useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setOpenState((prev) => {
        const value = typeof next === "function" ? next(openProp ?? prev) : next;
        onOpenChange?.(value);
        return value;
      });
    },
    [onOpenChange, openProp],
  );
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [isMac, setIsMac] = React.useState(false);

  // Raccourci global Ctrl+K / ⌘K (toggle), détection plateforme.
  React.useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(window.navigator.userAgent));
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  // Filtrage : chaque mot tapé doit apparaître dans label+keywords+group.
  const results = React.useMemo(() => {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return items.slice(0, MAX_RESULTS);
    return items
      .filter((item) => {
        const haystack = normalize(
          [item.label, item.keywords ?? "", item.group ?? ""].join(" ")
        );
        return tokens.every((t) => haystack.includes(t));
      })
      .slice(0, MAX_RESULTS);
  }, [items, query]);

  // Regroupement (ordre de première apparition) ; index plat pour le clavier.
  const groups = React.useMemo(() => {
    const map = new Map<string, { item: CommandPaletteItem; index: number }[]>();
    results.forEach((item, index) => {
      const key = item.group ?? "";
      const bucket = map.get(key) ?? [];
      bucket.push({ item, index });
      map.set(key, bucket);
    });
    return Array.from(map.entries());
  }, [results]);

  const optionId = (index: number) => `${listboxId}-option-${index}`;

  // Garde l'élément actif visible et dans les bornes.
  React.useEffect(() => {
    if (active > results.length - 1) setActive(0);
  }, [results, active]);

  React.useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      setActive(0);
    }
  };

  const select = React.useCallback(
    (item: CommandPaletteItem) => {
      setOpen(false);
      item.action?.();
      if (item.href) router.push(item.href);
    },
    [router]
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[active];
      if (item) select(item);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-950/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:duration-150" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[18%] z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-card-hover focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:duration-150"
          aria-label="Palette de commandes"
        >
          <DialogPrimitive.Title className="sr-only">
            Palette de commandes
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Rechercher une page ou une action, puis valider avec Entrée.
          </DialogPrimitive.Description>

          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Rechercher une page ou une action…"
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={results.length > 0 ? optionId(active) : undefined}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden shrink-0 select-none rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
              {isMac ? "⌘K" : "Ctrl K"}
            </kbd>
          </div>

          <div id={listboxId} role="listbox" aria-label="Résultats" className="max-h-80 overflow-y-auto p-2">
            {results.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aucun résultat pour «&nbsp;{query}&nbsp;»
              </p>
            ) : (
              groups.map(([group, entries]) => (
                <div key={group || "__default"}>
                  {group && (
                    <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group}
                    </div>
                  )}
                  {entries.map(({ item, index }) => (
                    <div
                      key={`${item.label}-${index}`}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === active}
                      onPointerMove={() => setActive(index)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => select(item)}
                      className={cn(
                        "flex cursor-pointer select-none items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors duration-100",
                        index === active ? "bg-muted text-foreground" : "text-foreground/80"
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.hint && (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {item.hint}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            <span>↑↓ naviguer · ↵ ouvrir · Échap fermer</span>
            <span className="tabular-nums">
              {results.length} résultat{results.length > 1 ? "s" : ""}
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
