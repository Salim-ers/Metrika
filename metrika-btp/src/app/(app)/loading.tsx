import { PageSkeleton } from "@/components/ui/skeleton";

/** Affiché instantanément pendant le chargement d'un segment serveur
 *  (ex: tableau de bord) → la navigation paraît immédiate. */
export default function Loading() {
  return <PageSkeleton />;
}
