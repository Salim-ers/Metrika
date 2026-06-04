"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/**
 * Transition d'entrée sobre entre les pages (fondu + léger glissé).
 * Rejouée à chaque changement de route. Respecte prefers-reduced-motion.
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useGSAP(
    () => {
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce || !ref.current) return;
      gsap.fromTo(
        ref.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" },
      );
    },
    { scope: ref, dependencies: [pathname] },
  );

  return (
    <div ref={ref} className="min-h-full">
      {children}
    </div>
  );
}
