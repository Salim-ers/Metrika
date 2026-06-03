import { cn } from "@/lib/utils";

/**
 * Logo Metrika reconstitué en SVG (gratte-ciels + règle graduée),
 * aux couleurs de marque. `variant` adapte la couleur du texte
 * pour fond clair ou fond marine (sidebar).
 */
export function MetrikaLogo({
  className,
  variant = "dark",
  showText = true,
}: {
  className?: string;
  variant?: "dark" | "light";
  showText?: boolean;
}) {
  const navy = variant === "light" ? "#FFFFFF" : "#14233F";
  const navySub = variant === "light" ? "#FFFFFF" : "#0A1A35";
  const gold = "#E1A532";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <svg viewBox="0 0 120 130" className="h-9 w-auto shrink-0" aria-hidden>
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
          <div className="font-display text-xl font-bold tracking-tight" style={{ color: navy }}>
            METRIKA
          </div>
          <div className="mt-0.5 text-[10px] font-semibold tracking-[0.18em]" style={{ color: gold }}>
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
