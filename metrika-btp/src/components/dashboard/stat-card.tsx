import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { AnimatedNumber } from "./animated-number";

export function StatCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <Card className="group relative overflow-hidden p-5 transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span className={cn("flex size-8 items-center justify-center rounded-lg", accent ? "bg-gold-100 text-gold-700" : "bg-navy-50 text-navy-600")}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="kpi-number mt-4 text-4xl text-navy-900">
        {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      <div className={cn("absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100", accent ? "bg-gold-500" : "bg-navy-600")} />
    </Card>
  );
}
