/**
 * Garde-fous de sécurité pour les routes recevant des fichiers (uploads).
 * Limite le nombre de fichiers, la taille unitaire et totale, et le type MIME
 * pour éviter les abus (déni de service par gros fichiers, types inattendus).
 */
export const MAX_FILES = 30;
export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 Mo par fichier
export const MAX_TOTAL_BYTES = 40 * 1024 * 1024; // 40 Mo au total

export interface UploadLimits {
  maxFiles?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  /** Préfixes/MIME autorisés, ex: ["application/pdf"] ou ["image/"]. */
  allowed: string[];
}

/** Valide une liste de fichiers. Renvoie un message d'erreur, ou null si OK. */
export function validateUploads(files: File[], limits: UploadLimits): string | null {
  const maxFiles = limits.maxFiles ?? MAX_FILES;
  const maxFileBytes = limits.maxFileBytes ?? MAX_FILE_BYTES;
  const maxTotalBytes = limits.maxTotalBytes ?? MAX_TOTAL_BYTES;

  if (files.length === 0) return "Aucun fichier fourni.";
  if (files.length > maxFiles) return `Trop de fichiers (max ${maxFiles}).`;

  let total = 0;
  for (const f of files) {
    if (!(f instanceof File)) return "Fichier invalide.";
    const type = f.type || "";
    const ok = limits.allowed.some((a) => (a.endsWith("/") ? type.startsWith(a) : type === a));
    if (!ok) return `Type de fichier non autorisé : ${f.name || type || "inconnu"}.`;
    if (f.size > maxFileBytes) return `Fichier trop volumineux : ${f.name} (max ${Math.round(maxFileBytes / 1024 / 1024)} Mo).`;
    total += f.size;
  }
  if (total > maxTotalBytes) return `Volume total trop important (max ${Math.round(maxTotalBytes / 1024 / 1024)} Mo).`;
  return null;
}

/** Limite du payload d'images base64 envoyé aux routes IA (~4,2 Mo). */
export const MAX_IMAGE_PAYLOAD_CHARS = 4_200_000;

/** Vérifie qu'un lot d'images base64 ne dépasse pas la limite. */
export function imagePayloadError(images: { data?: string }[]): string | null {
  const total = images.reduce((n, im) => n + (im?.data?.length ?? 0), 0);
  if (total > MAX_IMAGE_PAYLOAD_CHARS) {
    return "Document trop volumineux pour l'analyse. Réduisez le nombre de pages.";
  }
  return null;
}

/** JSON.parse défensif : renvoie le fallback au lieu de lever une exception. */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
