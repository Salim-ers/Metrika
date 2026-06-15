export interface DpgfLineInput {
  lot: string;
  code?: string;
  designation: string;
  description?: string;
  unit: string;
  quantity: number;
  // Traçabilité & fiabilité (anti-hallucination)
  quantitySource?: string;   // dpgf | cctp | plan | metre | none
  sourceExcerpt?: string;    // court extrait justifiant la ligne
  confidence?: string;       // high | medium | low
  status?: string;           // confirmed | to_measure | inferred | conflict | missing
}

export interface SousDetailComponentInput {
  type: "MAIN_OEUVRE" | "MATERIAUX" | "MATERIEL";
  designation: string;
  unit: string;
  quantity: number;
  unitCost: number;
}

export interface QuoteLineInput {
  designation: string;
  description?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}
