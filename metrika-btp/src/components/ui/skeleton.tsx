import { cn } from "@/lib/utils";

/** Bloc de chargement animé (placeholder) aux couleurs neutres de la marque. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted/60", className)} aria-hidden />;
}

/** Squelette générique de page : en-tête + grille de cartes. Réutilisé par les
 *  fichiers loading.tsx pour donner un ressenti de navigation instantané. */
export function PageSkeleton() {
  return (
    <div className="animate-fade-up">
      <div className="mb-8 space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
