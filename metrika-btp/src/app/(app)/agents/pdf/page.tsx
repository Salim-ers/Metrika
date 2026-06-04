"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Upload, FileStack, Images, ArrowUp, ArrowDown, Trash2,
  Loader2, Download, FileText, Settings2,
} from "lucide-react";

interface PickedFile { file: File; id: string }

function fmtSize(n: number) {
  return n > 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : `${Math.round(n / 1024)} Ko`;
}

function FileTray({
  files, setFiles, accept, hint,
}: {
  files: PickedFile[];
  setFiles: (f: PickedFile[]) => void;
  accept: string;
  hint: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function add(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).map((file) => ({ file, id: crypto.randomUUID() }));
    setFiles([...files, ...next]);
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= files.length) return;
    const copy = [...files];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setFiles(copy);
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 py-10 text-center transition-colors hover:border-gold-400 hover:bg-gold-50/40"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-navy-50 text-navy-600">
          <Upload className="size-5" />
        </span>
        <p className="mt-3 text-sm font-medium text-navy-800">Glissez vos fichiers ici ou cliquez</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
        <input ref={inputRef} type="file" accept={accept} multiple hidden onChange={(e) => add(e.target.files)} />
      </div>

      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((f, i) => (
            <li key={f.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
              <span className="flex size-7 items-center justify-center rounded-md bg-navy-700 text-xs font-semibold text-white">{i + 1}</span>
              <FileText className="size-4 text-muted-foreground" />
              <span className="flex-1 truncate text-sm text-navy-800">{f.file.name}</span>
              <span className="text-xs text-muted-foreground">{fmtSize(f.file.size)}</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="size-7" onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></Button>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></Button>
                <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => setFiles(files.filter((x) => x.id !== f.id))}><Trash2 className="size-3.5" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PdfAgentPage() {
  const [pdfFiles, setPdfFiles] = useState<PickedFile[]>([]);
  const [imgFiles, setImgFiles] = useState<PickedFile[]>([]);
  const [compress, setCompress] = useState(true);
  const [busy, setBusy] = useState(false);

  // Fusion 100 % côté navigateur (pdf-lib) : aucune limite de taille/nombre,
  // les fichiers ne quittent jamais la machine.
  async function mergeLocally(files: PickedFile[], compress: boolean) {
    if (files.length === 0) { toast.error("Ajoutez au moins un fichier."); return; }
    setBusy(true);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const out = await PDFDocument.create();
      for (const { file } of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      }
      const data = await out.save({ useObjectStreams: compress });
      const blob = new Blob([data as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "metrika-fusion.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${files.length} PDF fusionnés et téléchargés.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur pendant la fusion. Un fichier est-il un PDF valide ?");
    } finally {
      setBusy(false);
    }
  }

  // Conversion images → PDF côté navigateur : décodage + ré-encodage JPEG via
  // canvas (respecte l'orientation EXIF), puis assemblage pdf-lib. Aucune limite serveur.
  async function imagesToPdfLocally(files: PickedFile[]) {
    if (files.length === 0) { toast.error("Ajoutez au moins une image."); return; }
    setBusy(true);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      for (const { file } of files) {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
        if (!bitmap) throw new Error(`Image illisible : ${file.name}`);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas indisponible");
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close?.();
        const jpgBlob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
        if (!jpgBlob) throw new Error(`Conversion impossible : ${file.name}`);
        const embedded = await doc.embedJpg(new Uint8Array(await jpgBlob.arrayBuffer()));
        const page = doc.addPage([canvas.width, canvas.height]);
        page.drawImage(embedded, { x: 0, y: 0, width: canvas.width, height: canvas.height });
      }
      const data = await doc.save();
      const blob = new Blob([data as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "metrika-images.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${files.length} image(s) converties en PDF.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur pendant la conversion");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Outils PDF"
        title="PDF &"
        accent="Images"
        description="Fusionnez, réorganisez et convertissez vos documents. Réorganisez l’ordre avant export."
      />

      <Tabs defaultValue="merge">
        <TabsList>
          <TabsTrigger value="merge"><FileStack className="size-4" /> Fusionner des PDF</TabsTrigger>
          <TabsTrigger value="images"><Images className="size-4" /> Images → PDF</TabsTrigger>
        </TabsList>

        <TabsContent value="merge">
          <Card>
            <CardContent className="space-y-5 pt-6">
              <FileTray files={pdfFiles} setFiles={setPdfFiles} accept="application/pdf" hint="Fichiers PDF — fusionnés dans l’ordre affiché" />

              <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-muted/40 px-4 py-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-navy-800">
                  <input type="checkbox" checked={compress} onChange={(e) => setCompress(e.target.checked)} className="size-4 accent-gold-500" />
                  <Settings2 className="size-4 text-muted-foreground" /> Compresser / optimiser le PDF final
                </label>
                <Badge variant="muted">{pdfFiles.length} fichier(s)</Badge>
              </div>

              <Button variant="gold" size="lg" disabled={busy} onClick={() => mergeLocally(pdfFiles, compress)}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Fusionner et télécharger
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="images">
          <Card>
            <CardContent className="space-y-5 pt-6">
              <FileTray files={imgFiles} setFiles={setImgFiles} accept="image/*" hint="JPG, PNG, WEBP — une image par page, dans l’ordre affiché" />
              <div className="flex items-center justify-end">
                <Badge variant="muted">{imgFiles.length} image(s)</Badge>
              </div>
              <Button variant="gold" size="lg" disabled={busy} onClick={() => imagesToPdfLocally(imgFiles)}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Convertir en PDF
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
