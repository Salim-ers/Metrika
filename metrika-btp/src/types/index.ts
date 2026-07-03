export interface DpgfLineInput {
  lot: string;
  code?: string;
  designation: string;
  description?: string;
  unit: string;
  quantity: number;
  // Traçabilité & fiabilité (anti-hallucination)
  quantitySource?: string;   // cdpgf | dpgf | cctp | plan | metre | none
  sourceExcerpt?: string;    // court extrait justifiant la ligne
  confidence?: string;       // high | medium | low
  status?: string;           // confirmed | calculated | to_measure | inferred | conflict | missing
  calculation?: string;      // formule obligatoire si status = "calculated" (ex. « 65,60 × 10,30 »)
}

export interface SousDetailComponentInput {
  type: "MAIN_OEUVRE" | "MATERIAUX" | "MATERIEL" | "TRANSPORT";
  designation: string;
  unit: string;
  quantity: number;
  unitCost: number;
  /** Provenance du coût : "bibliotheque" | "manuel" | null = à renseigner. */
  costSource?: string | null;
}

export interface QuoteLineInput {
  designation: string;
  description?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}
