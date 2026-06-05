"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Logo Metrika.
 * - variant "light" (fonds marine : connexion, menu) : utilise l'image de marque
 *   public/brand/metrika-logo.png si présente ; sinon repli sur le logo SVG.
 * - variant "dark" (fonds clairs : aperçus/exports) : logo SVG reconstitué.
 */
const SIZES = {
  sm: { gap: "gap-3", svg: "h-9", img: "h-10", name: "text-xl", sub: "text-[10px]", subGap: "mt-0.5" },
  lg: { gap: "gap-4", svg: "h-16", img: "h-16", name: "text-3xl", sub: "text-xs", subGap: "mt-1" },
  xl: { gap: "gap-5", svg: "h-28", img: "h-28", name: "text-5xl", sub: "text-sm", subGap: "mt-1.5" },
} as const;

export function MetrikaLogo({
  className,
  variant = "dark",
  showText = true,
  size = "sm",
}: {
  className?: string;
  variant?: "dark" | "light";
  showText?: boolean;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  const [imgFailed, setImgFailed] = useState(false);

  // Sur fond marine, on privilégie l'image de marque (lockup complet).
  if (variant === "light" && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/brand/metrika-logo.png"
        alt="Metrika Métrage BTP"
        className={cn(s.img, "w-auto shrink-0 object-contain", className)}
        onError={() => setImgFailed(true)}
      />
    );
  }

  const navy = variant === "light" ? "#FFFFFF" : "#14233F";
  const navySub = variant === "light" ? "#FFFFFF" : "#0A1A35";
  const gold = "#E1A532";

  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <svg viewBox="0 0 120 130" className={cn(s.svg, "w-auto shrink-0")} aria-hidden>
        {/* règle graduée dorée */}
        <path d="M14 40 V112 H40" fill="none" stroke={gold} strokeWidth="5" />
        {[52, 64, 76, 88, 100].map((y) => (
          <line key={y} x1="14" y1={y} x2="26" y2={y} stroke={gold} strokeWidth="3" />
        ))}
        {/* tours marine */}
        <rect x="44" y="18" width="13" height="94" fill={navySub} />
        <rect x="60" y="46" width="13" height="66" fill={navy} />
        <rect x="76" y="62" width="11" height="50" fill={navySub} />
        {/* contour doré tour avant */}
        <path d="M60 46 L73 38 V112" fill="none" stroke={gold} strokeWidth="3" />
        {/* socle courbe */}
        <path d="M10 118 Q60 132 104 118" fill="none" stroke={navySub} strokeWidth="6" strokeLinecap="round" />
      </svg>

      {showText && (
        <div className="leading-none">
          <div className={cn("font-display font-bold tracking-tight", s.name)} style={{ color: navy }}>
            METRIKA
          </div>
          <div className={cn("font-semibold tracking-[0.18em]", s.sub, s.subGap)} style={{ color: gold }}>
            MÉTRAGE BTP
            <span className="ml-1.5" style={{ color: variant === "light" ? "#9fb0cc" : "#33497f" }}>
              MAROC
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
