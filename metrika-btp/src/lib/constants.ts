import {
  LayoutDashboard, FileStack, FileText, Table2, Calculator,
  Library, ReceiptText, Settings, LayoutGrid, Languages, Users, ShieldCheck, GitCompare,
  FolderKanban, FileDown,
} from "lucide-react";

/** Lots BTP disponibles pour la génération de CCTP (multi-sélection). */
export const LOTS_BTP = [
  "CCTP Général",
  "Gros Œuvre",
  "Étanchéité",
  "Revêtements",
  "Menuiserie Bois",
  "Menuiserie Aluminium",
  "Serrurerie",
  "Peinture",
  "Plomberie Sanitaire",
  "Protection Incendie",
  "Climatisation / Ventilation",
  "Électricité CFO",
  "Courant Faible",
  "Ascenseurs",
  "VRD",
  "Aménagements Extérieurs",
] as const;

export const PROJECT_TYPES = [
  "Logement collectif", "Villa / individuel", "Tertiaire / bureaux",
  "Commercial", "Industriel", "Équipement public", "Hôtellerie",
] as const;

export const UNITS = ["m²", "ml", "m³", "U", "ens", "kg", "forfait"] as const;

/** Métiers / types de clients & prospects (archi, BET, économiste…). */
export const CLIENT_TYPES = [
  { value: "ARCHITECTE", label: "Architecte" },
  { value: "BET", label: "Bureau d’études" },
  { value: "ECONOMISTE", label: "Économiste" },
  { value: "PROMOTEUR", label: "Promoteur" },
  { value: "ENTREPRISE", label: "Entreprise BTP" },
  { value: "MOA", label: "Maître d’ouvrage" },
  { value: "PARTICULIER", label: "Particulier" },
  { value: "AUTRE", label: "Autre" },
] as const;

/** Statut commercial du client. */
export const CLIENT_STATUSES = [
  { value: "PROSPECT", label: "Prospect" },
  { value: "EN_COURS", label: "En cours" },
  { value: "CLIENT", label: "Client" },
  { value: "PERDU", label: "Perdu" },
] as const;

/** Navigation principale (sidebar). */
export const NAV = [
  {
    group: "Pilotage",
    items: [
      { label: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard },
      { label: "Projets", href: "/projets", icon: FolderKanban },
      { label: "Clients & prospects", href: "/clients", icon: Users },
    ],
  },
  {
    group: "Outils documentaires",
    items: [
      { label: "Vue d’ensemble", href: "/agents", icon: LayoutGrid },
      { label: "CCTP", href: "/agents/cctp", icon: FileText },
      { label: "DPGF / CDPGF", href: "/agents/dpgf", icon: Table2 },
      { label: "Sous-détail de prix", href: "/agents/sous-detail", icon: Calculator },
      { label: "Audit CCTP ↔ DPGF", href: "/agents/audit", icon: ShieldCheck },
      { label: "Comparaison CCTP ↔ CCTP", href: "/agents/compare-cctp", icon: GitCompare },
      { label: "Traduction PDF", href: "/agents/traduction", icon: Languages },
      { label: "PDF & Images", href: "/agents/pdf", icon: FileStack },
    ],
  },
  {
    group: "Production",
    items: [
      { label: "Bibliothèque de prix", href: "/bibliotheque-prix", icon: Library },
      { label: "Devis", href: "/devis", icon: ReceiptText },
      { label: "Exports", href: "/exports", icon: FileDown },
    ],
  },
  {
    group: "Organisation",
    items: [{ label: "Paramètres entreprise", href: "/parametres", icon: Settings }],
  },
] as const;

/** Juridictions disponibles pour un projet / CCTP. */
export const JURISDICTIONS = [
  { value: "Maroc", label: "Maroc", refs: "NM · RPS 2000 · CCAG-T" },
  { value: "France", label: "France", refs: "NF DTU · Eurocodes · CCTG" },
  { value: "Mixte", label: "Mixte (FR + MA)", refs: "Double référentiel" },
] as const;

/** Statuts projet. */
export const PROJECT_STATUSES = [
  { value: "EN_COURS", label: "En cours" },
  { value: "DCE", label: "DCE" },
  { value: "CONSULTATION", label: "Consultation" },
  { value: "TRAVAUX", label: "Travaux" },
  { value: "ARCHIVE", label: "Archivé" },
] as const;
