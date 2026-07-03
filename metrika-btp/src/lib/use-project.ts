"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Contexte PROJET global — pivot de la navigation connectée.
 * Le projet actif (léger) est visible partout (topbar) et alimente les
 * agents : juridiction, devise, TVA, rattachement des documents générés.
 */
export interface ActiveProject {
  id: string;
  name: string;
  reference?: string | null;
  type?: string | null;
  jurisdiction: string;          // Maroc | France | Mixte
  currency?: string | null;      // MAD | EUR
  vatRate?: number | null;
  status?: string;
}

interface ProjectState {
  project: ActiveProject | null;
  setProject: (p: ActiveProject | null) => void;
  clearProject: () => void;
}

export const useProject = create<ProjectState>()(
  persist(
    (set) => ({
      project: null,
      setProject: (project) => set({ project }),
      clearProject: () => set({ project: null }),
    }),
    { name: "metrika-active-project" },
  ),
);
