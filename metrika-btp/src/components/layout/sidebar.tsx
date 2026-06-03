"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/constants";
import { MetrikaLogo } from "./metrika-logo";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  // Lien actif = la correspondance la PLUS spécifique (le plus long préfixe),
  // pour éviter qu'un parent comme /agents s'allume sur /agents/sous-detail.
  const allHrefs = NAV.flatMap((s) => s.items.map((i) => i.href));
  const bestMatch = allHrefs
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <aside className="hidden w-[264px] shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-[72px] items-center border-b border-sidebar-border px-6">
        <MetrikaLogo variant="light" />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
        {NAV.map((section) => (
          <div key={section.group}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-muted">
              {section.group}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = item.href === bestMatch;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                        active
                          ? "bg-gold-500 text-navy-900 shadow-gold"
                          : "text-sidebar-foreground/85 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Icon className={cn("size-[18px]", active ? "text-navy-900" : "text-sidebar-muted group-hover:text-gold-400")} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-6 py-4">
        <p className="text-[11px] text-sidebar-muted">
          Plateforme privée · accès sécurisé
        </p>
      </div>
    </aside>
  );
}
