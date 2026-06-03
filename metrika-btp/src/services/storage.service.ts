import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const DRIVER = process.env.STORAGE_DRIVER ?? "local";
const LOCAL_ROOT = process.env.STORAGE_LOCAL_PATH ?? "./uploads";

/**
 * Couche de stockage abstraite.
 *
 * `storageKey` (stocké en base, modèle Document) :
 *  - driver "local"        → nom de fichier relatif à STORAGE_LOCAL_PATH
 *  - driver "vercel-blob"  → URL publique complète du blob
 *
 * Les appelants utilisent la même signature quel que soit le driver.
 */
export interface StorageDriver {
  /** Persiste le contenu et renvoie la clé à conserver en base. */
  save(buffer: Buffer | Uint8Array, originalName: string): Promise<string>;
  /** Relit le contenu à partir de la clé. */
  read(key: string): Promise<Buffer>;
  /** Renvoie un chemin (local) ou une URL (blob) exploitable. */
  resolve(key: string): string;
}

function uniqueKey(originalName: string): string {
  const safe = originalName.replace(/[^\w.\-]+/g, "_");
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safe}`;
}

function toBuffer(data: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

// ── Driver local (développement / serveur avec disque persistant) ──
const localDriver: StorageDriver = {
  async save(buffer, originalName) {
    const key = uniqueKey(originalName);
    const dest = path.join(LOCAL_ROOT, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, toBuffer(buffer));
    return key;
  },
  async read(key) {
    return fs.readFile(path.join(LOCAL_ROOT, key));
  },
  resolve(key) {
    return path.join(LOCAL_ROOT, key);
  },
};

// ── Driver Vercel Blob (production serverless — disque en lecture seule) ──
// Nécessite la variable d'environnement BLOB_READ_WRITE_TOKEN
// (ajoutée automatiquement par Vercel à la création du store Blob).
const blobDriver: StorageDriver = {
  async save(buffer, originalName) {
    const { put } = await import("@vercel/blob");
    const blob = await put(uniqueKey(originalName), toBuffer(buffer), {
      access: "public",
      addRandomSuffix: false,
    });
    return blob.url; // l'URL publique sert de clé de stockage
  },
  async read(key) {
    const res = await fetch(key);
    if (!res.ok) {
      throw new Error(`Lecture du blob échouée (${res.status}) : ${key}`);
    }
    return Buffer.from(await res.arrayBuffer());
  },
  resolve(key) {
    return key; // déjà une URL publique
  },
};

export const storage: StorageDriver =
  DRIVER === "vercel-blob" ? blobDriver : localDriver;
