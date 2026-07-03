"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/** Vrai si l'utilisateur préfère réduire les animations. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Révélation en cascade des enfants directs marqués [data-reveal].
 * Poser le ref retourné sur le conteneur ; rejoue à chaque changement de deps.
 * Respecte prefers-reduced-motion (état final appliqué sans animation).
 *
 * @example
 * const listRef = useRevealList<HTMLDivElement>([items.length]);
 * <div ref={listRef}>{items.map(i => <Card data-reveal key={i.id} … />)}</div>
 */
export function useRevealList<T extends HTMLElement>(deps: unknown[] = []) {
  const ref = useRef<T>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const targets = el.querySelectorAll<HTMLElement>(":scope > [data-reveal]");
      if (targets.length === 0) return;

      if (prefersReducedMotion()) {
        gsap.set(targets, { opacity: 1, y: 0 });
        return;
      }
      gsap.fromTo(
        targets,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.35, stagger: 0.05, ease: "power2.out" },
      );
    },
    { scope: ref, dependencies: deps },
  );

  return ref;
}

/**
 * Pulsation discrète (scale 1 → 1.02 → 1) à chaque changement de `value`
 * — utile pour attirer l'œil sur un KPI qui vient d'être recalculé.
 * Pas d'animation au montage ni si prefers-reduced-motion est actif.
 *
 * @example
 * const totalRef = usePulseOnChange<HTMLSpanElement>(totalHT);
 * <span ref={totalRef} className="kpi-number">{formatMAD(totalHT)}</span>
 */
export function usePulseOnChange<T extends HTMLElement>(value: unknown) {
  const ref = useRef<T>(null);
  const mounted = useRef(false);

  useGSAP(
    () => {
      if (!mounted.current) {
        mounted.current = true;
        return;
      }
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;
      gsap.fromTo(
        el,
        { scale: 1 },
        {
          scale: 1.02,
          duration: 0.125,
          yoyo: true,
          repeat: 1,
          ease: "power1.inOut",
          transformOrigin: "center center",
        },
      );
    },
    { scope: ref, dependencies: [value] },
  );

  return ref;
}
