"use client";

import { CompanyExport } from "@/lib/export-common";
import { createPdf } from "@/lib/pdf-kit";

interface AuditFinding {
  refSource?: string; elementSource: string; elementGenere: string;
  ecart: string; gravite: string; action: string; sourcePage?: string; statut?: string;
}
interface AuditResult {
  verdict: string;
  scores: { fidelite: number; exploitabilite: number; risqueMarche: number };
  findings: AuditFinding[];
  correctionsPrioritaires?: string[];
}

const GRAVITE_LABEL: Record<string, string> = { critique: "CRITIQUE", majeur: "MAJEUR", moyen: "MOYEN", mineur: "MINEUR" };

export async function exportAuditPdf(result: AuditResult, company?: CompanyExport | null): Promise<Uint8Array> {
  const k = await createPdf(company);
  const { C, W, M } = k;
  k.header({ title: "RAPPORT D'AUDIT", subtitle: "Comparaison CCTP ↔ DPGF" });

  // ── Scores ──
  const labels = [
    ["Fidélité", result.scores.fidelite],
    ["Exploitabilité", result.scores.exploitabilite],
    ["Risque marché", result.scores.risqueMarche],
  ] as const;
  const cardW = (W - 2 * M - 16) / 3;
  labels.forEach(([lab, val], i) => {
    const x = M + i * (cardW + 8);
    k.page.drawRectangle({ x, y: k.y - 40, width: cardW, height: 44, color: C.ZEBRA, borderColor: C.LIGHT, borderWidth: 0.5 });
    k.text(String(lab), x + 10, k.y - 14, { size: 7.5, bold: true, color: C.GREY });
    k.text(`${val} / 100`, x + 10, k.y - 32, { size: 16, bold: true, color: C.NAVY });
  });
  k.y -= 58;

  // ── Verdict ──
  k.text("VERDICT", M, k.y, { size: 9, bold: true, color: C.GOLD }); k.y -= 14;
  for (const ln of k.wrap(result.verdict || "—", 9.5, false, W - 2 * M)) { k.ensure(14); k.text(ln, M, k.y, { size: 9.5 }); k.y -= 13; }
  k.y -= 6;

  // ── Corrections prioritaires ──
  if (result.correctionsPrioritaires?.length) {
    k.ensure(20); k.text("CORRECTIONS PRIORITAIRES", M, k.y, { size: 9, bold: true, color: C.GOLD }); k.y -= 14;
    for (const c of result.correctionsPrioritaires) {
      for (const ln of k.wrap("•  " + c, 9, false, W - 2 * M - 6)) { k.ensure(13); k.text(ln, M + 4, k.y, { size: 9 }); k.y -= 12; }
    }
    k.y -= 6;
  }

  // ── Écarts (par bloc, classés par gravité déjà côté service) ──
  k.ensure(24); k.hr(k.y, C.NAVY, 0.8); k.y -= 14;
  k.text(`ÉCARTS DÉTECTÉS (${result.findings.length})`, M, k.y, { size: 11, bold: true, color: C.NAVY }); k.y -= 18;

  for (const f of result.findings) {
    k.ensure(58);
    const grav = GRAVITE_LABEL[f.gravite] ?? f.gravite.toUpperCase();
    const gravColor = f.gravite === "critique" ? C.GOLD : f.gravite === "majeur" ? C.GOLD : C.GREY;
    k.page.drawRectangle({ x: M, y: k.y - 13, width: W - 2 * M, height: 16, color: C.ZEBRA });
    k.text(grav, M + 6, k.y - 9, { size: 7.5, bold: true, color: gravColor });
    for (const ln of k.wrap(f.elementSource, 8.5, true, W - 2 * M - 90)) { k.text(ln, M + 70, k.y - 9, { size: 8.5, bold: true, color: C.NAVY }); break; }
    k.y -= 20;
    const row = (lab: string, val?: string) => {
      if (!val) return;
      k.text(lab, M + 6, k.y, { size: 7.5, bold: true, color: C.GREY });
      for (const ln of k.wrap(val, 8, false, W - 2 * M - 80)) { k.ensure(12); k.text(ln, M + 78, k.y, { size: 8 }); k.y -= 11; }
      k.y -= 1;
    };
    row("DPGF :", f.elementGenere);
    row("Écart :", f.ecart);
    row("Action :", f.action);
    row("Source :", f.sourcePage || f.refSource);
    k.y -= 6;
    k.hr(k.y + 2, C.LIGHT, 0.4);
  }

  k.y -= 20;
  k.stamp({ label: "Auditeur" });
  return k.finish("rapport-audit-cctp-dpgf.pdf");
}
