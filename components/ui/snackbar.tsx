"use client";

import { X } from "lucide-react";
import { useEffect, useCallback } from "react";

export type SnackbarVariant = "success" | "error";

type Props = {
  message: string | null;
  variant: SnackbarVariant;
  onDismiss: () => void;
  /** How long to show before auto-hiding (ms). Default 4500. */
  durationMs?: number;
};

export function Snackbar({ message, variant, onDismiss, durationMs = 4500 }: Props) {
  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(handleDismiss, durationMs);
    return () => window.clearTimeout(t);
  }, [message, durationMs, handleDismiss]);

  if (!message) return null;

  const styles =
    variant === "success"
      ? "border-emerald-600/40 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-950/90 dark:text-emerald-50"
      : "border-red-600/40 bg-red-50 text-red-950 dark:border-red-500/30 dark:bg-red-950/90 dark:text-red-50";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4"
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
    >
      <div
        className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${styles}`}
      >
        <p className="min-w-0 flex-1 leading-snug">{message}</p>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded-md p-0.5 opacity-70 transition hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
