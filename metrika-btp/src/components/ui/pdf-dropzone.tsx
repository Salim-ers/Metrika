"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Zone de dépôt réutilisable : clic OU glisser-déposer (drag & drop).
 * Utilisée par les agents CCTP et DPGF pour déposer des PDF.
 */
export function PdfDropzone({
  onFiles,
  title,
  hint,
  accept = "application/pdf",
}: {
  onFiles: (files: File[]) => void;
  title: string;
  hint: string;
  accept?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => ref.current?.click()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") ref.current?.click(); }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-6 text-center outline-none transition-colors",
        over
          ? "border-gold-500 bg-gold-50/60"
          : "border-border bg-muted/30 hover:border-gold-400 hover:bg-gold-50/40"
      )}
    >
      <Upload className="size-5 text-navy-600" />
      <span className="mt-1 text-xs font-medium text-navy-800">{title}</span>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}
