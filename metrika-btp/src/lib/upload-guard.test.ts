import { describe, it, expect } from "vitest";
import { validateUploads, safeJsonParse, imagePayloadError, MAX_FILES } from "./upload-guard";

function fakeFile(name: string, type: string, size: number): File {
  // Construit un File léger sans allouer `size` octets réels.
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("validateUploads", () => {
  it("refuse une liste vide", () => {
    expect(validateUploads([], { allowed: ["application/pdf"] })).toMatch(/aucun/i);
  });

  it("accepte des PDF valides", () => {
    const files = [fakeFile("a.pdf", "application/pdf", 1000)];
    expect(validateUploads(files, { allowed: ["application/pdf"] })).toBeNull();
  });

  it("refuse un type non autorisé", () => {
    const files = [fakeFile("a.exe", "application/x-msdownload", 1000)];
    expect(validateUploads(files, { allowed: ["application/pdf"] })).toMatch(/non autorisé/i);
  });

  it("accepte les préfixes MIME (image/)", () => {
    const files = [fakeFile("a.png", "image/png", 1000)];
    expect(validateUploads(files, { allowed: ["image/"] })).toBeNull();
  });

  it("refuse un fichier trop volumineux", () => {
    const files = [fakeFile("big.pdf", "application/pdf", 999 * 1024 * 1024)];
    expect(validateUploads(files, { allowed: ["application/pdf"] })).toMatch(/volumineux/i);
  });

  it("refuse trop de fichiers", () => {
    const files = Array.from({ length: MAX_FILES + 1 }, (_, i) => fakeFile(`f${i}.pdf`, "application/pdf", 10));
    expect(validateUploads(files, { allowed: ["application/pdf"] })).toMatch(/trop de fichiers/i);
  });

  it("refuse un volume total trop important", () => {
    const files = Array.from({ length: 5 }, (_, i) => fakeFile(`f${i}.pdf`, "application/pdf", 12 * 1024 * 1024));
    expect(validateUploads(files, { allowed: ["application/pdf"] })).toMatch(/total/i);
  });
});

describe("safeJsonParse", () => {
  it("parse un JSON valide", () => {
    expect(safeJsonParse<number[]>("[1,2,3]", [])).toEqual([1, 2, 3]);
  });
  it("renvoie le fallback sur JSON invalide", () => {
    expect(safeJsonParse<number[]>("{oops", [])).toEqual([]);
  });
  it("renvoie le fallback sur null/undefined", () => {
    expect(safeJsonParse<number[]>(null, [9])).toEqual([9]);
    expect(safeJsonParse<number[]>(undefined, [9])).toEqual([9]);
  });
});

describe("imagePayloadError", () => {
  it("accepte un petit payload", () => {
    expect(imagePayloadError([{ data: "abc" }])).toBeNull();
  });
  it("refuse un payload trop gros", () => {
    const big = "x".repeat(5_000_000);
    expect(imagePayloadError([{ data: big }])).toMatch(/volumineux/i);
  });
  it("tolère les images sans data", () => {
    expect(imagePayloadError([{}, { data: undefined }])).toBeNull();
  });
});
