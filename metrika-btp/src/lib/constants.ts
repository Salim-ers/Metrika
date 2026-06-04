import {
  LayoutDashboard, FileStack, FileText, Table2, Calculator,
  Library, ReceiptText, Settings, LayoutGrid,
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

/** Navigation principale (sidebar). */
export const NAV = [
  {
    group: "Pilotage",
    items: [{ label: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    group: "Outils documentaires",
    items: [
      { label: "Vue d’ensemble", href: "/agents", icon: LayoutGrid },
      { label: "PDF & Images", href: "/agents/pdf", icon: FileStack },
      { label: "Générateur CCTP", href: "/agents/cctp", icon: FileText },
      { label: "Décomposition DPGF", href: "/agents/dpgf", icon: Table2 },
      { label: "Sous-détail de prix", href: "/agents/sous-detail", icon: Calculator },
    ],
  },
  {
    group: "Production",
    items: [
      { label: "Bibliothèque de prix", href: "/bibliotheque-prix", icon: Library },
      { label: "Générateur de devis", href: "/devis", icon: ReceiptText },
    ],
  },
  {
    group: "Organisation",
    items: [{ label: "Paramètres entreprise", href: "/parametres", icon: Settings }],
  },
] as const;
