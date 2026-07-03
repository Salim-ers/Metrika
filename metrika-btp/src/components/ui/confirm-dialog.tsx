"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Libellé du bouton de confirmation. */
  confirmLabel?: string;
  /** Libellé du bouton d'annulation. */
  cancelLabel?: string;
  /** true (défaut) : action destructive → bouton rouge. */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  /** Action en cours : boutons désactivés + spinner, fermeture bloquée. */
  busy?: boolean;
}

/**
 * Confirmation avant action destructive (suppression, écrasement…).
 * S'appuie sur le Dialog Radix du design system.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Supprimer",
  cancelLabel = "Annuler",
  destructive = true,
  onConfirm,
  busy = false,
}: ConfirmDialogProps) {
  const handleOpenChange = (next: boolean) => {
    if (busy) return; // pas de fermeture pendant l'action
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={() => void onConfirm()}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {busy && <Loader2 aria-hidden="true" className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
