"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/**
 * Compteur animé : interpole de 0 jusqu'à `value` au montage (GSAP).
 * Respecte prefers-reduced-motion (affiche directement la valeur finale).
 */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce || value === 0) {
        el.textContent = String(value);
        return;
      }
      const obj = { n: 0 };
      gsap.to(obj, {
        n: value,
        duration: 1.1,
        ease: "power2.out",
        onUpdate: () => {
          el.textContent = Math.round(obj.n).toLocaleString("fr-FR");
        },
      });
    },
    { scope: ref, dependencies: [value] },
  );

  return <span ref={ref}>{value}</span>;
}
