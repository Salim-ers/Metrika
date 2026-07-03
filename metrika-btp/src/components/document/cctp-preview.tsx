"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ACTOR_ROLES, type ActorRole } from "@/lib/fidelity";

/**
 * Aperçu document du CCTP — rendu « pièce marché » : page de garde,
 * sommaire, chapitres numérotés hiérarchiquement (1 / 1.1 / 1.1.1),
 * tags de provenance mis en évidence, encadrés « À vérifier ».
 * L'aperçu reflète la numérotation de l'export PDF (même logique).
 */

export interface PreviewSection { lot: string; content: string }
export interface PreviewActor { role: string; value: string; status?: string }
export interface PreviewMeta {
  projectName?: string;
  projectType?: string;
  owner?: string;
  location?: string;
  jurisdiction?: string;
  indice?: string;
  version?: number;
  dateLabel?: string;
  companyName?: string;
}

type Node =
  | { kind: "chapter"; num: string; text: string }
  | { kind: "h2"; num: string; text: string }
  | { kind: "h3"; num: string; text: string }
  | { kind: "li"; text: string }
  | { kind: "p"; text: string };

interface TocEntry { level: 0 | 1 | 2; num: string; text: string }

function classify(line: string): { kind: "h2" | "h3" | "li" | "p" | "blank"; text: string } {
  const s = line.trimEnd();
  if (!s.trim()) return { kind: "blank", text: "" };
  if (s.startsWith("### ")) return { kind: "h3", text: s.slice(4) };
  if (s.startsWith("## ")) return { kind: "h2", text: s.slice(3) };
  if (s.startsWith("# ")) return { kind: "h2", text: s.slice(2) };
  if (/^\s*[-*]\s+/.test(s)) return { kind: "li", text: s.replace(/^\s*[-*]\s+/, "") };
  return { kind: "p", text: s };
}

function buildNodes(sections: PreviewSection[]): { nodes: Node[]; toc: TocEntry[] } {
  const nodes: Node[] = [];
  const toc: TocEntry[] = [];
  let chap = 0;
  for (const sec of sections) {
    chap++;
    let h2c = 0, h3c = 0;
    nodes.push({ kind: "chapter", num: String(chap), text: sec.lot });
    toc.push({ level: 0, num: String(chap), text: sec.lot });
    for (const raw of (sec.content ?? "").split("\n")) {
      const { kind, text } = classify(raw);
      if (kind === "h2") {
        h2c++; h3c = 0;
        const num = `${chap}.${h2c}`;
        nodes.push({ kind: "h2", num, text });
        toc.push({ level: 1, num, text });
      } else if (kind === "h3") {
        h3c++;
        const num = `${chap}.${h2c || 1}.${h3c}`;
        nodes.push({ kind: "h3", num, text });
        toc.push({ level: 2, num, text });
      } else if (kind === "li") nodes.push({ kind: "li", text });
      else if (kind === "p") nodes.push({ kind: "p", text });
    }
  }
  return { nodes, toc };
}

/** Tags de provenance/statut inline → pastilles colorées. */
const TAG_RE = /(\[(?:SOURCE (?:CCTP|CDPGF|RAPPORT)|SOURCE PLAN[^\]]*|CALCULÉ|CALCULE|À CONFIRMER|A CONFIRMER|COMPLÉMENT METRIKA[^\]]*|COMPLEMENT METRIKA[^\]]*|NON CONTRACTUEL)\])/gu;

function tagTone(tag: string): string {
  const t = tag.toUpperCase();
  if (t.includes("À CONFIRMER") || t.includes("A CONFIRMER")) return "bg-warning/15 text-warning-foreground border-warning/30";
  if (t.includes("COMPL")) return "bg-gold-100 text-gold-800 border-gold-200";
  if (t.includes("NON CONTRACTUEL")) return "bg-gold-100 text-gold-800 border-gold-200";
  if (t.includes("CALCUL")) return "bg-success/10 text-success border-success/25";
  return "bg-navy-50 text-navy-700 border-navy-100"; // SOURCE *
}

function renderInline(text: string): React.ReactNode {
  // Découpe tags, puis gras **…** à l'intérieur des segments texte.
  const parts = text.split(TAG_RE);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <span key={i} className={cn("mx-0.5 inline-block max-w-full truncate rounded border px-1 py-0 align-baseline text-[9px] font-semibold uppercase tracking-wide", tagTone(part))} title={part}>
          {part.length > 60 ? part.slice(0, 57) + "…]" : part}
        </span>
      );
    }
    const bold = part.split(/\*\*(.+?)\*\*/g);
    return bold.map((seg, j) => (j % 2 === 1 ? <strong key={`${i}-${j}`} className="font-semibold text-navy-900">{seg}</strong> : <React.Fragment key={`${i}-${j}`}>{seg}</React.Fragment>));
  });
}

const A_CONFIRMER_RE = /\[À CONFIRMER\]|\[A CONFIRMER\]|à confirmer sur plans|localisation à compléter/iu;

export function CctpPreview({
  sections,
  meta,
  actors,
  className,
}: {
  sections: PreviewSection[];
  meta?: PreviewMeta;
  actors?: PreviewActor[];
  className?: string;
}) {
  const { nodes, toc } = React.useMemo(() => buildNodes(sections), [sections]);
  const dateLabel = meta?.dateLabel || new Date().toLocaleDateString("fr-FR");
  const lots = sections.map((s) => s.lot);

  const sheet = "mx-auto w-full max-w-[794px] bg-white shadow-card rounded-sm border border-border/60 px-12 py-10";

  return (
    <div className={cn("space-y-4 bg-muted/40 p-4", className)}>
      {/* ── Page de garde ── */}
      <div className={cn(sheet, "relative overflow-hidden")}>
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gold-500" />
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-navy-900" />
        <div className="flex min-h-[600px] flex-col items-center text-center">
          <p className="mt-2 font-display text-sm font-semibold tracking-wide text-navy-900">
            {meta?.companyName || "Metrika Métrage BTP"}
          </p>
          {meta?.owner ? <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{meta.owner}</p> : null}
          {meta?.projectName ? (
            <h1 className="mt-2 text-balance font-display text-2xl font-bold text-navy-900">{meta.projectName}</h1>
          ) : (
            <h1 className="mt-2 font-display text-2xl font-bold text-muted-foreground/60">Nom du projet à renseigner</h1>
          )}
          {meta?.location ? <p className="mt-1 text-sm text-muted-foreground">{meta.location}</p> : null}

          <div className="mt-10 w-full max-w-md rounded-sm border-2 border-navy-900 bg-navy-50/40 px-6 py-6">
            <p className="font-display text-4xl font-bold tracking-wide text-navy-900">C.C.T.P</p>
            <p className="mt-1 text-[11px] text-muted-foreground">(Cahier des Clauses Techniques Particulières)</p>
            <p className="mt-3 text-sm font-semibold text-navy-800">
              {lots.length === 1 ? `LOT : ${lots[0]}` : `${lots.length} LOTS`}
            </p>
            {lots.length > 1 ? <p className="mt-1 text-[11px] text-muted-foreground">{lots.join(" • ")}</p> : null}
          </div>

          {/* Intervenants (table unique du projet) */}
          {actors && actors.length > 0 && (
            <table className="mt-8 w-full max-w-md text-left text-[11px]">
              <tbody>
                {actors.map((a) => (
                  <tr key={a.role} className="border-b border-border/50 last:border-0">
                    <td className="py-1 pr-3 font-semibold uppercase tracking-wide text-gold-700">
                      {ACTOR_ROLES[a.role as ActorRole]?.label ?? a.role}
                    </td>
                    <td className={cn("py-1 text-navy-800", a.status === "missing" && "italic text-muted-foreground")}>
                      {a.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mt-auto w-full pt-8">
            <table className="mx-auto w-full max-w-md border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-navy-200 text-left uppercase tracking-wider text-muted-foreground">
                  <th className="py-1 pr-2">Indice</th><th className="py-1 pr-2">Version</th><th className="py-1 pr-2">Date</th><th className="py-1">Objet</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-navy-800">
                  <td className="py-1 pr-2 font-semibold">{meta?.indice ?? "A"}</td>
                  <td className="py-1 pr-2 tabular-nums">v{meta?.version ?? 1}</td>
                  <td className="py-1 pr-2 tabular-nums">{dateLabel}</td>
                  <td className="py-1">Première diffusion</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-4 border-t border-border pt-3 text-[9px] leading-relaxed text-muted-foreground">
              Document généré automatiquement à partir des pièces fournies — validation MOE / BET / Bureau de contrôle requise avant diffusion.
              {meta?.jurisdiction ? ` Juridiction : ${meta.jurisdiction}.` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* ── Sommaire ── */}
      {toc.length > 0 && (
        <div className={sheet}>
          <h2 className="mb-4 font-display text-lg font-bold text-navy-900">SOMMAIRE</h2>
          <ul className="space-y-0.5 text-[11px] leading-relaxed">
            {toc.map((e, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-baseline gap-2",
                  e.level === 0 && "mt-2 font-semibold text-navy-900",
                  e.level === 1 && "pl-4 text-navy-800",
                  e.level === 2 && "pl-9 text-muted-foreground",
                )}
              >
                <span className="shrink-0 tabular-nums">{e.num}</span>
                <span className="truncate">{e.text}</span>
                <span className="mx-1 flex-1 border-b border-dotted border-border" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Corps ── */}
      <div className={cn(sheet, "space-y-1.5")}>
        {nodes.map((n, i) => {
          if (n.kind === "chapter") {
            return (
              <div key={i} className="-mx-3 mt-6 bg-navy-900 px-3 py-1.5 first:mt-0">
                <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white">
                  {n.num}.  {n.text}
                </h2>
              </div>
            );
          }
          if (n.kind === "h2") {
            return <h3 key={i} className="mt-4 border-b border-border/60 pb-0.5 text-[13px] font-bold text-navy-900">{n.num}  {renderInline(n.text)}</h3>;
          }
          if (n.kind === "h3") {
            return <h4 key={i} className="mt-2.5 pl-3 text-xs font-bold text-navy-800">{n.num}  {renderInline(n.text)}</h4>;
          }
          if (n.kind === "li") {
            return (
              <p key={i} className="flex gap-1.5 pl-6 text-[11px] leading-relaxed text-navy-800">
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-navy-400" />
                <span className="min-w-0">{renderInline(n.text)}</span>
              </p>
            );
          }
          // Paragraphe — encadré si marqué « à confirmer ».
          const flagged = A_CONFIRMER_RE.test(n.text);
          return (
            <p
              key={i}
              className={cn(
                "text-[11px] leading-relaxed text-navy-800",
                flagged && "rounded-sm border border-warning/40 bg-warning/10 px-2 py-1",
              )}
            >
              {renderInline(n.text)}
            </p>
          );
        })}
        <p className="mt-8 border-t border-border pt-3 text-center text-[9px] text-muted-foreground">
          {meta?.companyName || "Metrika Métrage BTP"} — {dateLabel} — Document de travail : validation humaine requise avant diffusion.
        </p>
      </div>
    </div>
  );
}
