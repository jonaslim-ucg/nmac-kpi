"use client";

import {
  CalendarRange,
  CircleAlert,
  CircleCheck,
  Loader2,
  Mail,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/auth/session-provider";
import {
  normalizeSurveyMonthlyReportConfig,
  validateSurveyMonthlyReportConfig,
  type SurveyMonthlyReportConfig,
  type SurveyMonthlyReportPeriod,
  type SurveyMonthlyReportRecipient,
} from "@/lib/survey-outreach/monthly-report-config";

type Health = {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastResult: {
    periodKey: string;
    periodLabel: string;
    sent: number;
    skipped: number;
    errors: number;
    recipients: number;
  } | null;
};

type Delivery = {
  id: string;
  periodKey: string;
  recipientEmail: string;
  recipientName: string;
  status: "sending" | "sent" | "failed";
  sentAt: string | null;
  error: string | null;
  createdAt: string;
};

type ApiPayload = {
  config?: SurveyMonthlyReportConfig;
  period?: SurveyMonthlyReportPeriod;
  health?: Health;
  deliveries?: Delivery[];
  error?: string;
};

type Feedback = { tone: "ok" | "err"; text: string } | null;

function formatWhen(value: string | null): string {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Atlantic/Bermuda",
    timeZoneName: "short",
  }).format(parsed);
}

function newRecipient(): SurveyMonthlyReportRecipient {
  return {
    id: crypto.randomUUID(),
    name: "",
    title: "",
    department: "",
    email: "",
    enabled: true,
  };
}

export function SurveyMonthlyReportPanel() {
  const { user } = useSession();
  const [config, setConfig] = useState<SurveyMonthlyReportConfig | null>(null);
  const [savedConfig, setSavedConfig] = useState<SurveyMonthlyReportConfig | null>(null);
  const [period, setPeriod] = useState<SurveyMonthlyReportPeriod | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [testEmail, setTestEmail] = useState(user?.email ?? "");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/dev/survey-outreach/monthly-report", {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json()) as ApiPayload;
      if (!response.ok || !payload.config) {
        setFeedback({ tone: "err", text: payload.error ?? "Could not load monthly report settings." });
        return;
      }
      const normalized = normalizeSurveyMonthlyReportConfig(payload.config);
      setConfig(normalized);
      setSavedConfig(normalized);
      setPeriod(payload.period ?? null);
      setHealth(payload.health ?? null);
      setDeliveries(payload.deliveries ?? []);
    } catch {
      setFeedback({ tone: "err", text: "Could not load monthly report settings." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (user?.email && !testEmail) setTestEmail(user.email);
  }, [testEmail, user?.email]);

  const dirty = useMemo(
    () => Boolean(config && savedConfig && JSON.stringify(config) !== JSON.stringify(savedConfig)),
    [config, savedConfig],
  );
  const validationError = config ? validateSurveyMonthlyReportConfig(config) : null;
  const enabledRecipientCount = config?.recipients.filter((recipient) => recipient.enabled).length ?? 0;

  function updateRecipient(id: string, patch: Partial<SurveyMonthlyReportRecipient>) {
    if (!config) return;
    setFeedback(null);
    setConfig({
      ...config,
      recipients: config.recipients.map((recipient) => (
        recipient.id === id ? { ...recipient, ...patch } : recipient
      )),
    });
  }

  async function save() {
    if (!config) return;
    const error = validateSurveyMonthlyReportConfig(config);
    if (error) {
      setFeedback({ tone: "err", text: error });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/dev/survey-outreach/monthly-report", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const payload = (await response.json()) as ApiPayload;
      if (!response.ok || !payload.config) {
        setFeedback({ tone: "err", text: payload.error ?? "Could not save monthly report settings." });
        return;
      }
      const normalized = normalizeSurveyMonthlyReportConfig(payload.config);
      setConfig(normalized);
      setSavedConfig(normalized);
      setPeriod(payload.period ?? period);
      setFeedback({
        tone: "ok",
        text: normalized.enabled
          ? "Monthly manager report enabled and saved."
          : "Monthly manager report settings saved.",
      });
    } catch {
      setFeedback({ tone: "err", text: "Could not save monthly report settings." });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    const recipient = testEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      setFeedback({ tone: "err", text: "Enter a valid test recipient email." });
      return;
    }
    setTesting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/dev/survey-outreach/monthly-report", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          to: recipient,
          recipientName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Manager",
        }),
      });
      const payload = (await response.json()) as { periodLabel?: string; error?: string };
      if (!response.ok) {
        setFeedback({ tone: "err", text: payload.error ?? "Could not send monthly report test." });
        return;
      }
      setFeedback({
        tone: "ok",
        text: `Test ${payload.periodLabel ?? "monthly"} report sent to ${recipient}.`,
      });
    } catch {
      setFeedback({ tone: "err", text: "Could not send monthly report test." });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading monthly report settings…
        </span>
      </section>
    );
  }

  if (!config) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/[0.04]">
      <div className="border-b border-border bg-surface-muted/40 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h2 className="text-sm font-semibold text-foreground">Monthly manager survey report</h2>
          </div>
          <span
            className={
              "rounded-full px-2.5 py-1 text-xs font-semibold " +
              (config.enabled
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-muted text-muted-foreground")
            }
          >
            {config.enabled ? "Enabled" : "Off"}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Emails a summary of the previous calendar month. Patient names and comments stay in the staff dashboard.
        </p>
      </div>

      <div className="space-y-5 px-4 py-4 sm:px-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px] lg:items-end">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-3 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Automatic monthly delivery</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {enabledRecipientCount} manager{enabledRecipientCount === 1 ? "" : "s"} selected
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.enabled}
              onClick={() => {
                setFeedback(null);
                setConfig({ ...config, enabled: !config.enabled });
              }}
              className={
                "relative h-7 w-12 rounded-full transition " +
                (config.enabled ? "bg-accent" : "bg-muted")
              }
            >
              <span
                className={
                  "absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform " +
                  (config.enabled ? "translate-x-5" : "translate-x-0")
                }
              />
            </button>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Send day</span>
            <select
              value={config.dayOfMonth}
              onChange={(event) => {
                setFeedback(null);
                setConfig({ ...config, dayOfMonth: Number(event.target.value) });
              }}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground"
            >
              {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>Day {day}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bermuda time</span>
            <input
              type="time"
              value={config.sendTime}
              onChange={(event) => {
                setFeedback(null);
                setConfig({ ...config, sendTime: event.target.value });
              }}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
        </div>

        <div className="rounded-lg border border-border bg-surface-muted/25 px-3 py-3 text-sm">
          <p className="font-medium text-foreground">
            Next report: {period?.label ?? "previous calendar month"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Scheduled for {formatWhen(period?.scheduledAt ?? null)}. If that time has passed, enabling the report sends it on the next scheduler check.
          </p>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Manager recipients</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Enter an email for every selected manager.</p>
            </div>
            <button
              type="button"
              onClick={() => setConfig({ ...config, recipients: [...config.recipients, newRecipient()] })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-muted/60"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add manager
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {config.recipients.map((recipient) => (
              <div key={recipient.id} className="rounded-xl border border-border bg-background p-3">
                <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.25fr)_auto] md:items-end">
                  <label className="flex h-10 items-center gap-2 text-xs font-medium text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={recipient.enabled}
                      onChange={(event) => updateRecipient(recipient.id, { enabled: event.target.checked })}
                      className="h-4 w-4 rounded border-border accent-[var(--accent)]"
                    />
                    Include
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Name</span>
                    <input
                      type="text"
                      value={recipient.name}
                      onChange={(event) => updateRecipient(recipient.id, { name: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Email</span>
                    <input
                      type="email"
                      value={recipient.email}
                      placeholder="manager@ucg.bm"
                      onChange={(event) => updateRecipient(recipient.id, { email: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <button
                    type="button"
                    title={`Remove ${recipient.name || "manager"}`}
                    aria-label={`Remove ${recipient.name || "manager"}`}
                    onClick={() => setConfig({
                      ...config,
                      recipients: config.recipients.filter((item) => item.id !== recipient.id),
                    })}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-destructive/50 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Title</span>
                    <input
                      type="text"
                      value={recipient.title}
                      onChange={(event) => updateRecipient(recipient.id, { title: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Department</span>
                    <input
                      type="text"
                      value={recipient.department}
                      onChange={(event) => updateRecipient(recipient.id, { department: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 border-t border-border pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label className="block max-w-md">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Test recipient</span>
              <div className="mt-1.5 flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(event) => setTestEmail(event.target.value)}
                    className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground"
                  />
                </div>
                <button
                  type="button"
                  disabled={testing}
                  onClick={() => void sendTest()}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted/60 disabled:opacity-50"
                >
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                  Send test
                </button>
              </div>
            </label>
            <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              {health?.lastError ? (
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
              ) : (
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              )}
              <div>
                <p>
                  Last successful monthly run: {formatWhen(health?.lastSuccessAt ?? null)}
                  {health?.lastResult ? ` · ${health.lastResult.sent} sent, ${health.lastResult.skipped} already delivered` : ""}
                </p>
                {health?.lastError ? <p className="mt-1 text-destructive">Last issue: {health.lastError}</p> : null}
                {deliveries.length > 0 ? (
                  <p className="mt-1">Latest delivery: {deliveries[0].recipientName || deliveries[0].recipientEmail} · {deliveries[0].status}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            {feedback ? (
              <p className={"text-sm " + (feedback.tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                {feedback.text}
              </p>
            ) : validationError && dirty ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">{validationError}</p>
            ) : null}
            <button
              type="button"
              disabled={saving || !dirty || Boolean(validationError)}
              onClick={() => void save()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-95 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              Save monthly report
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
