export interface DpgfLineInput {
  lot: string;
  code?: string;
  designation: string;
  description?: string;
  unit: string;
  quantity: number;
  quantitySource?: string;
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
