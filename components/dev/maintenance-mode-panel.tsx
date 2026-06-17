"use client";

import { AlertTriangle, Loader2, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/auth/session-provider";
import { canAccessDev } from "@/lib/auth/types";

type Feedback = { tone: "ok" | "err"; text: string } | null;

function SwitchRow({
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
  icon,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
  icon: ReactNode;
}) {
  return (
    <div className="flex gap-3 py-1 sm:gap-4">
      <div
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted/60 text-muted-foreground"
        aria-hidden
      >
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-4 sm:gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-disabled={disabled}
          disabled={disabled}
          aria-label={`${title}: ${checked ? "on" : "off"}`}
          onClick={() => onCheckedChange(!checked)}
          className={
            "relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 " +
            (checked ? "bg-amber-500" : "bg-muted-foreground/30")
          }
        >
          <span
            className={
              "pointer-events-none absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow transition-[left] duration-200 ease-out " +
              (checked ? "left-[calc(100%-1.625rem)]" : "left-0.5")
            }
            aria-hidden
          />
        </button>
      </div>
    </div>
  );
}

export function MaintenanceModePanel() {
  const { user, loading } = useSession();
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const load = useCallback(async () => {
    setInitialLoading(true);
    setFeedback(null);
    try {
      const r = await fetch("/api/dev/maintenance", { credentials: "include", cache: "no-store" });
      const j = (await r.json()) as { maintenanceMode?: boolean; error?: string };
      if (!r.ok) {
        setFeedback({ tone: "err", text: j.error ?? "Could not load maintenance mode." });
        return;
      }
      setMaintenanceMode(j.maintenanceMode === true);
    } catch {
      setFeedback({ tone: "err", text: "Could not load maintenance mode." });
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !canAccessDev(user?.role)) return;
    void load();
  }, [loading, user?.role, load]);

  const onToggle = useCallback(
    async (next: boolean) => {
      if (!canAccessDev(user?.role) || saving) return;
      setSaving(true);
      setFeedback(null);
      setMaintenanceMode(next);
      try {
        const r = await fetch("/api/dev/maintenance", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maintenance_mode: next }),
        });
        const j = (await r.json()) as { maintenanceMode?: boolean; error?: string };
        if (!r.ok) {
          setMaintenanceMode(!next);
          setFeedback({ tone: "err", text: j.error ?? "Could not update maintenance mode." });
          return;
        }
        setMaintenanceMode(j.maintenanceMode === true);
        setFeedback({
          tone: "ok",
          text: j.maintenanceMode
            ? "Maintenance mode is on. Viewers and editors are blocked."
            : "Maintenance mode is off. Everyone can access the app again.",
        });
      } catch {
        setMaintenanceMode(!next);
        setFeedback({ tone: "err", text: "Could not update maintenance mode." });
      } finally {
        setSaving(false);
      }
    },
    [saving, user?.role],
  );

  if (loading || initialLoading) {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading maintenance settings…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {maintenanceMode ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="text-xs leading-relaxed text-foreground">
            Maintenance mode is active. Only administrators and developers can use NMAC KPI right now.
          </p>
        </div>
      ) : null}

      <SwitchRow
        title="Maintenance mode"
        description="When on, viewers and editors cannot open the app or sign in. Administrators and developers keep full access."
        checked={maintenanceMode}
        disabled={saving}
        onCheckedChange={onToggle}
        icon={<Wrench className="h-4 w-4" aria-hidden />}
      />

      {feedback ? (
        <p
          className={
            "text-xs " + (feedback.tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")
          }
          role={feedback.tone === "err" ? "alert" : "status"}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
