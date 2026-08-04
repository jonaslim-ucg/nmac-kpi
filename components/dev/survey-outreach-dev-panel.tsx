"use client";

import {
  CalendarClock,
  CircleCheck,
  Loader2,
  Mail,
  Power,
  RotateCcw,
  Save,
  Search,
  Send,
  TriangleAlert,
  X,
} from "lucide-react";
import type { SurveyOutreachStage } from "@/lib/survey-outreach/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/auth/session-provider";
import { canAccessDev } from "@/lib/auth/types";

type ScheduleConfig = {
  initialDelayHours: number;
  reminder1Days: number;
  reminder2Days: number;
  finalReminderDays: number;
};

type SentRow = {
  id: string;
  patientEmail: string;
  patientName: string;
  isTest: boolean;
  appointmentDate: string | null;
  appointmentAt: string | null;
  initialSentAt: string | null;
  reminder1SentAt: string | null;
  reminder2SentAt: string | null;
  finalSentAt: string | null;
  completedAt: string | null;
  status: string;
  stagesSent: string;
  crmAppointmentId: string | null;
  appointmentCount: number;
  providerNames: string[];
  nextScheduledMessage: {
    stage: SurveyOutreachStage;
    stageLabel: string;
    dueAt: string;
    isManual: boolean;
  } | null;
  manualNextScheduledAt: string | null;
};

type SentStats = {
  totalRows: number;
  withInitialSent: number;
  uniqueRecipients: number;
  testRows: number;
  failedRows: number;
};

type BounceSummary = {
  total: number;
  production: number;
  tests: number;
  unmatched: number;
  hard: number;
};

type BounceRow = {
  id: string;
  recipientEmail: string | null;
  stage: SurveyOutreachStage | null;
  isTest: boolean | null;
  receivedAt: string;
  statusCode: string | null;
  reason: string;
  hardBounce: boolean;
  matched: boolean;
};

type SchedulerHealth = {
  ready: boolean;
  cronAuthConfigured: boolean;
  crmConfigured: boolean;
  mailConfigured: boolean;
  databaseConfigured: boolean;
  missing: string[];
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  failedRows: number;
  lastResult: {
    sent: number;
    skipped: number;
    errors: number;
    syncErrors: number;
    deferredDue: number;
  } | null;
};

type Feedback = { tone: "ok" | "err"; text: string } | null;

type SchedulerCheckResult = {
  ok?: boolean;
  sent?: { stage: SurveyOutreachStage; to: string }[];
  skipped?: unknown[];
  errors?: unknown[];
  configurationErrors?: string[];
  message?: string;
  error?: string;
};

type PrepScenario = SurveyOutreachStage;

type PreparedTestState = {
  row: {
    id: string;
    patientEmail: string;
    patientName: string;
    initialSentAt: string | null;
    reminder1SentAt: string | null;
    reminder2SentAt: string | null;
    finalSentAt: string | null;
    completedAt: string | null;
    manualNextScheduledAt: string | null;
  } | null;
  nextAction: {
    stage: SurveyOutreachStage;
    stageLabel: string;
    dueAt: string;
    isManual: boolean;
  } | null;
};

const PREP_SCENARIOS: { value: PrepScenario; label: string; hint: string }[] = [
  { value: "initial", label: "Prepare initial survey", hint: "No email sent yet; next action is the initial survey." },
  { value: "reminder1", label: "Prepare Reminder 1", hint: "Initial survey already sent; Reminder 1 is next." },
  { value: "reminder2", label: "Prepare Reminder 2", hint: "Initial and Reminder 1 already sent." },
  { value: "final", label: "Prepare final reminder", hint: "Initial, Reminder 1, and Reminder 2 already sent." },
];

const PAGE_SIZE = 50;
const DEFAULT_PREP_EMAIL = "kim.ramirez@ucg.bm";
const DEFAULT_PREP_NAME = "Kim Ramirez";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function toDateTimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export function SurveyOutreachDevPanel() {
  const { user, loading: sessionLoading } = useSession();
  const [schedule, setSchedule] = useState<ScheduleConfig | null>(null);
  const [savedSchedule, setSavedSchedule] = useState<ScheduleConfig | null>(null);
  const [summary, setSummary] = useState("");
  const [sendingEnabled, setSendingEnabled] = useState(false);
  const [sendingAppEnabled, setSendingAppEnabled] = useState(false);
  const [sendingMasterEnabled, setSendingMasterEnabled] = useState(false);
  const [liveStartAt, setLiveStartAt] = useState<string | null>(null);
  const [schedulerHealth, setSchedulerHealth] = useState<SchedulerHealth | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [sendingToggleSaving, setSendingToggleSaving] = useState(false);
  const [scheduleFeedback, setScheduleFeedback] = useState<Feedback>(null);
  const [sendingFeedback, setSendingFeedback] = useState<Feedback>(null);

  const [rows, setRows] = useState<SentRow[]>([]);
  const [stats, setStats] = useState<SentStats | null>(null);
  const [bounceSummary, setBounceSummary] = useState<BounceSummary | null>(null);
  const [bounces, setBounces] = useState<BounceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [testFilter, setTestFilter] = useState<"all" | "prod" | "test">("prod");
  const [sentLoading, setSentLoading] = useState(true);
  const [sentFeedback, setSentFeedback] = useState<Feedback>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [manualNextScheduleValue, setManualNextScheduleValue] = useState("");
  const [manualScheduleSaving, setManualScheduleSaving] = useState(false);
  const [manualScheduleFeedback, setManualScheduleFeedback] = useState<Feedback>(null);
  const [localSchedulerEnabled, setLocalSchedulerEnabled] = useState(false);
  const [localSchedulerChecking, setLocalSchedulerChecking] = useState(false);
  const [localSchedulerLastRun, setLocalSchedulerLastRun] = useState<string | null>(null);
  const [localSchedulerFeedback, setLocalSchedulerFeedback] = useState<Feedback>(null);
  const localSchedulerInFlight = useRef(false);
  const [suppressedEmails, setSuppressedEmails] = useState(0);
  const [recalledRows, setRecalledRows] = useState(0);
  const [prepState, setPrepState] = useState<PreparedTestState | null>(null);
  const [prepEmail, setPrepEmail] = useState(DEFAULT_PREP_EMAIL);
  const prepEmailRef = useRef(DEFAULT_PREP_EMAIL);
  const [prepName, setPrepName] = useState(DEFAULT_PREP_NAME);
  const [prepDueInMinutes, setPrepDueInMinutes] = useState(30);
  const [prepBusy, setPrepBusy] = useState<PrepScenario | null>(null);
  const [prepFeedback, setPrepFeedback] = useState<Feedback>(null);

  const selectedRow = selectedRowId ? rows.find((row) => row.id === selectedRowId) ?? null : null;

  const loadRecallStats = useCallback(async () => {
    try {
      const r = await fetch("/api/dev/survey-outreach/recall", { credentials: "include", cache: "no-store" });
      const j = (await r.json()) as { suppressedEmails?: number; recalledRows?: number };
      if (r.ok) {
        setSuppressedEmails(j.suppressedEmails ?? 0);
        setRecalledRows(j.recalledRows ?? 0);
      }
    } catch {
      // non-fatal
    }
  }, []);

  const loadPrepState = useCallback(async (email?: string) => {
    try {
      const targetEmail = (email ?? prepEmailRef.current).trim() || DEFAULT_PREP_EMAIL;
      const params = new URLSearchParams({ email: targetEmail });
      const r = await fetch(`/api/dev/survey-outreach/prepare?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await r.json()) as PreparedTestState & { error?: string };
      if (r.ok) {
        setPrepState({ row: j.row ?? null, nextAction: j.nextAction ?? null });
      }
    } catch {
      // non-fatal
    }
  }, []);

  const loadSchedule = useCallback(async () => {
    setScheduleLoading(true);
    setScheduleFeedback(null);
    try {
      const r = await fetch("/api/dev/survey-outreach/schedule", { credentials: "include", cache: "no-store" });
      const j = (await r.json()) as {
        schedule?: ScheduleConfig;
        summary?: string;
        sendingEnabled?: boolean;
        sendingAppEnabled?: boolean;
        sendingMasterEnabled?: boolean;
        liveStartAt?: string | null;
        schedulerHealth?: SchedulerHealth;
        error?: string;
      };
      if (!r.ok) {
        setScheduleFeedback({ tone: "err", text: j.error ?? "Could not load schedule." });
        return;
      }
      if (j.schedule) {
        setSchedule(j.schedule);
        setSavedSchedule(j.schedule);
      }
      setSummary(j.summary ?? "");
      setSendingEnabled(Boolean(j.sendingEnabled));
      setSendingAppEnabled(Boolean(j.sendingAppEnabled));
      setSendingMasterEnabled(Boolean(j.sendingMasterEnabled));
      setLiveStartAt(j.liveStartAt ?? null);
      setSchedulerHealth(j.schedulerHealth ?? null);
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  const loadSent = useCallback(async () => {
    setSentLoading(true);
    setSentFeedback(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        sentOnly: "true",
      });
      if (search) params.set("search", search);
      if (testFilter === "test") params.set("testOnly", "true");
      if (testFilter === "prod") params.set("testOnly", "false");

      const r = await fetch(`/api/dev/survey-outreach/sent?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await r.json()) as {
        rows?: SentRow[];
        total?: number;
        stats?: SentStats;
        bounceSummary?: BounceSummary;
        bounces?: BounceRow[];
        error?: string;
      };
      if (!r.ok) {
        setSentFeedback({ tone: "err", text: j.error ?? "Could not load sent emails." });
        return;
      }
      setRows(j.rows ?? []);
      setTotal(j.total ?? 0);
      setStats(j.stats ?? null);
      setBounceSummary(j.bounceSummary ?? null);
      setBounces(j.bounces ?? []);
    } finally {
      setSentLoading(false);
    }
  }, [offset, search, testFilter]);

  useEffect(() => {
    if (sessionLoading || !canAccessDev(user?.role)) return;
    void loadSchedule();
    void loadRecallStats();
    void loadPrepState();
  }, [sessionLoading, user?.role, loadSchedule, loadRecallStats, loadPrepState]);

  useEffect(() => {
    if (sessionLoading || !canAccessDev(user?.role)) return;
    void loadSent();
  }, [sessionLoading, user?.role, loadSent]);

  useEffect(() => {
    const nextValue = selectedRow?.manualNextScheduledAt ?? selectedRow?.nextScheduledMessage?.dueAt ?? null;
    setManualNextScheduleValue(toDateTimeLocalValue(nextValue));
    setManualScheduleFeedback(null);
  }, [selectedRow?.id, selectedRow?.manualNextScheduledAt, selectedRow?.nextScheduledMessage?.dueAt]);

  async function prepareScenario(scenario: PrepScenario) {
    if (!prepEmail.trim()) {
      setPrepFeedback({ tone: "err", text: "Enter a test email address." });
      return;
    }

    setPrepBusy(scenario);
    setPrepFeedback(null);
    try {
      const r = await fetch("/api/dev/survey-outreach/prepare", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario,
          email: prepEmail.trim(),
          patientName: prepName.trim() || DEFAULT_PREP_NAME,
          dueInMinutes: prepDueInMinutes,
        }),
      });
      const j = (await r.json()) as PreparedTestState & { error?: string };
      if (!r.ok) {
        setPrepFeedback({ tone: "err", text: j.error ?? "Could not prepare test scenario." });
        return;
      }

      setPrepState({ row: j.row ?? null, nextAction: j.nextAction ?? null });
      setPrepFeedback({
        tone: "ok",
        text: `${PREP_SCENARIOS.find((item) => item.value === scenario)?.label ?? "Scenario"} ready.`,
      });
      void loadSent();
    } finally {
      setPrepBusy(null);
    }
  }

  async function saveSchedule() {
    if (!schedule) return;
    setScheduleSaving(true);
    setScheduleFeedback(null);
    try {
      const r = await fetch("/api/dev/survey-outreach/schedule", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      });
      const j = (await r.json()) as {
        schedule?: ScheduleConfig;
        summary?: string;
        sendingEnabled?: boolean;
        sendingAppEnabled?: boolean;
        sendingMasterEnabled?: boolean;
        liveStartAt?: string | null;
        schedulerHealth?: SchedulerHealth;
        error?: string;
      };
      if (!r.ok) {
        setScheduleFeedback({ tone: "err", text: j.error ?? "Could not save schedule." });
        return;
      }
      if (j.schedule) {
        setSchedule(j.schedule);
        setSavedSchedule(j.schedule);
      }
      setSummary(j.summary ?? "");
      setSendingEnabled(Boolean(j.sendingEnabled));
      setSendingAppEnabled(Boolean(j.sendingAppEnabled));
      setSendingMasterEnabled(Boolean(j.sendingMasterEnabled));
      setLiveStartAt(j.liveStartAt ?? null);
      setSchedulerHealth(j.schedulerHealth ?? null);
      setScheduleFeedback({ tone: "ok", text: "Reminder schedule saved." });
      void loadSent();
    } finally {
      setScheduleSaving(false);
    }
  }

  async function toggleSurveySending() {
    const next = !sendingAppEnabled;
    setSendingToggleSaving(true);
    setSendingFeedback(null);
    try {
      const r = await fetch("/api/dev/survey-outreach/schedule", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendingEnabled: next }),
      });
      const j = (await r.json()) as {
        schedule?: ScheduleConfig;
        summary?: string;
        sendingEnabled?: boolean;
        sendingAppEnabled?: boolean;
        sendingMasterEnabled?: boolean;
        liveStartAt?: string | null;
        schedulerHealth?: SchedulerHealth;
        error?: string;
      };
      if (!r.ok) {
        setSendingFeedback({ tone: "err", text: j.error ?? "Could not update survey sending." });
        return;
      }
      if (j.schedule && !schedule) {
        setSchedule(j.schedule);
        setSavedSchedule(j.schedule);
      }
      setSummary(j.summary ?? "");
      setSendingEnabled(Boolean(j.sendingEnabled));
      setSendingAppEnabled(Boolean(j.sendingAppEnabled));
      setSendingMasterEnabled(Boolean(j.sendingMasterEnabled));
      setLiveStartAt(j.liveStartAt ?? null);
      setSchedulerHealth(j.schedulerHealth ?? null);
      setSendingFeedback({
        tone: "ok",
        text: next ? "Survey sending switch turned on." : "Survey sending switch turned off.",
      });
    } finally {
      setSendingToggleSaving(false);
    }
  }

  async function saveManualNextSchedule(manualNextScheduledAt: string | null) {
    if (!selectedRow) return;

    if (manualNextScheduledAt !== null) {
      if (!manualNextScheduledAt) {
        setManualScheduleFeedback({ tone: "err", text: "Choose a date and time." });
        return;
      }
      const parsed = new Date(manualNextScheduledAt);
      if (!Number.isFinite(parsed.getTime())) {
        setManualScheduleFeedback({ tone: "err", text: "Choose a valid date and time." });
        return;
      }
      manualNextScheduledAt = parsed.toISOString();
    }

    setManualScheduleSaving(true);
    setManualScheduleFeedback(null);
    try {
      const r = await fetch("/api/dev/survey-outreach/sent", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedRow.id,
          manualNextScheduledAt,
        }),
      });
      const j = (await r.json()) as { row?: SentRow; error?: string };
      if (!r.ok || !j.row) {
        setManualScheduleFeedback({ tone: "err", text: j.error ?? "Could not save next schedule." });
        return;
      }

      setRows((prev) => prev.map((row) => (row.id === j.row!.id ? j.row! : row)));
      setManualScheduleFeedback({
        tone: "ok",
        text: manualNextScheduledAt ? "Next schedule saved." : "Using automatic schedule.",
      });
    } finally {
      setManualScheduleSaving(false);
    }
  }

  const runLocalSchedulerCheck = useCallback(async () => {
    if (localSchedulerInFlight.current) return;
    localSchedulerInFlight.current = true;
    setLocalSchedulerChecking(true);
    setLocalSchedulerFeedback(null);
    setPrepFeedback(null);
    try {
      let currentPrepState = prepState;
      if (prepState?.row) {
        const update = await fetch("/api/dev/survey-outreach/prepare", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: prepEmail.trim(),
            patientName: prepName.trim() || DEFAULT_PREP_NAME,
            dueInMinutes: prepDueInMinutes,
          }),
        });
        const updated = (await update.json()) as PreparedTestState & { error?: string };
        if (!update.ok) {
          setLocalSchedulerFeedback({
            tone: "err",
            text: updated.error ?? "Could not update the current test row.",
          });
          return;
        }
        currentPrepState = { row: updated.row ?? null, nextAction: updated.nextAction ?? null };
        setPrepState(currentPrepState);
      }

      const r = await fetch("/api/dev/survey-outreach/scheduler", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      const j = (await r.json()) as SchedulerCheckResult;
      if (!r.ok || j.ok === false) {
        setLocalSchedulerFeedback({ tone: "err", text: j.error ?? "Scheduled check failed." });
        return;
      }

      const sentCount = j.sent?.length ?? 0;
      const errorCount = j.errors?.length ?? 0;
      const configurationError = j.configurationErrors?.[0];
      setLocalSchedulerLastRun(new Date().toISOString());
      if (configurationError) {
        setLocalSchedulerFeedback({ tone: "err", text: configurationError });
      } else if (errorCount > 0) {
        setLocalSchedulerFeedback({
          tone: "err",
          text: `Checked schedule. ${errorCount} email(s) failed.`,
        });
      } else {
        const prepDueAt = currentPrepState?.nextAction ? new Date(currentPrepState.nextAction.dueAt).getTime() : null;
        const prepNotDueYet =
          sentCount === 0 &&
          prepDueAt !== null &&
          Number.isFinite(prepDueAt) &&
          prepDueAt > Date.now();
        setLocalSchedulerFeedback({
          tone: "ok",
          text:
            sentCount > 0
              ? `Sent ${sentCount} scheduled test email(s).`
              : prepNotDueYet && currentPrepState?.nextAction
                ? `${currentPrepState.nextAction.stageLabel} is not due yet. Scheduled for ${formatWhen(currentPrepState.nextAction.dueAt)}.`
              : j.message ?? "Checked schedule. No test email is due.",
        });
      }
      void loadSent();
      void loadPrepState(prepEmailRef.current);
    } catch {
      setLocalSchedulerFeedback({ tone: "err", text: "Scheduled check failed." });
    } finally {
      localSchedulerInFlight.current = false;
      setLocalSchedulerChecking(false);
    }
  }, [loadPrepState, loadSent, prepDueInMinutes, prepEmail, prepName, prepState]);

  useEffect(() => {
    if (sessionLoading || !canAccessDev(user?.role) || !localSchedulerEnabled) return;
    void runLocalSchedulerCheck();
    const id = window.setInterval(() => void runLocalSchedulerCheck(), 60_000);
    return () => window.clearInterval(id);
  }, [sessionLoading, user?.role, localSchedulerEnabled, runLocalSchedulerCheck]);

  if (sessionLoading || scheduleLoading) {
    return <p className="text-sm text-muted-foreground">Loading survey outreach…</p>;
  }

  if (!canAccessDev(user?.role)) {
    return <p className="text-sm text-muted-foreground">Developer access required.</p>;
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedStageDetails = selectedRow
    ? [
        { label: "Initial survey", sentAt: selectedRow.initialSentAt },
        { label: "Reminder 1", sentAt: selectedRow.reminder1SentAt },
        { label: "Reminder 2", sentAt: selectedRow.reminder2SentAt },
        { label: "Final reminder", sentAt: selectedRow.finalSentAt },
      ]
    : [];
  const selectedNextDueMs = selectedRow?.nextScheduledMessage
    ? new Date(selectedRow.nextScheduledMessage.dueAt).getTime()
    : null;
  const selectedNextIsDue = selectedNextDueMs !== null && Number.isFinite(selectedNextDueMs) && selectedNextDueMs <= Date.now();
  const prepNextDueMs = prepState?.nextAction ? new Date(prepState.nextAction.dueAt).getTime() : null;
  const prepNextIsDue = prepNextDueMs !== null && Number.isFinite(prepNextDueMs) && prepNextDueMs <= Date.now();
  const liveSendingReady = sendingEnabled && Boolean(liveStartAt);
  const sendingStatusLabel = liveSendingReady
    ? "Live sending active"
    : sendingAppEnabled && sendingMasterEnabled
      ? "Needs live-start date"
      : sendingAppEnabled
        ? "Ready in app, deployment off"
        : "Live sending off";
  const sendingStatusTone = liveSendingReady
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "bg-amber-500/15 text-amber-800 dark:text-amber-200";
  const sendingStatusDetail = !sendingMasterEnabled
    ? "The deployment master switch is off, so live patient emails cannot send yet."
    : sendingAppEnabled
      ? liveStartAt
        ? `Only visits at or after ${formatWhen(liveStartAt)} can receive live survey emails.`
        : "Set the live-start timestamp before sending to patients."
      : "Turn this on only when you are ready for eligible checked-out visits to receive survey emails.";
  const schedulerLastRunMs = schedulerHealth?.lastRunAt
    ? new Date(schedulerHealth.lastRunAt).getTime()
    : NaN;
  const schedulerRunFresh = Number.isFinite(schedulerLastRunMs)
    && Date.now() - schedulerLastRunMs <= 5 * 60 * 1000;
  const schedulerHealthDetail = !schedulerHealth
    ? "Scheduler readiness could not be checked."
    : !schedulerHealth.cronAuthConfigured
      ? "Scheduler blocked: add CRON_SECRET to Vercel Production, then redeploy."
      : !schedulerHealth.ready
        ? `Scheduler setup is incomplete: ${schedulerHealth.missing.join(", ")}.`
        : schedulerHealth.lastRunAt && !schedulerRunFresh
          ? `Scheduler has not checked in since ${formatWhen(schedulerHealth.lastRunAt)}.`
        : schedulerHealth.failedRows > 0
          ? `${schedulerHealth.failedRows} message(s) need review before they can be retried.`
          : schedulerHealth.lastSuccessAt
            ? `Last successful scheduled check: ${formatWhen(schedulerHealth.lastSuccessAt)}.`
            : "Scheduler configuration is ready. Waiting for the first successful scheduled check.";
  const schedulerHealthy = Boolean(
    schedulerHealth?.ready &&
      schedulerRunFresh &&
      schedulerHealth.failedRows === 0 &&
      !schedulerHealth.lastError,
  );
  const scheduleDirty = Boolean(
    schedule &&
      savedSchedule &&
      (schedule.initialDelayHours !== savedSchedule.initialDelayHours ||
        schedule.reminder1Days !== savedSchedule.reminder1Days ||
        schedule.reminder2Days !== savedSchedule.reminder2Days ||
        schedule.finalReminderDays !== savedSchedule.finalReminderDays),
  );
  const scheduleValid = Boolean(
    schedule &&
      Number.isInteger(schedule.initialDelayHours) &&
      schedule.initialDelayHours >= 2 &&
      schedule.initialDelayHours <= 24 &&
      schedule.reminder1Days === 3 &&
      schedule.reminder2Days === 7 &&
      (schedule.finalReminderDays === 14 || schedule.finalReminderDays === 21),
  );
  const displayedScheduleSummary = scheduleDirty && schedule
    ? `Initial survey: ${schedule.initialDelayHours} hours after the patient's last appointment of the day. Reminders: Day 3, Day 7, and Day ${schedule.finalReminderDays} after the initial survey, only while incomplete.`
    : summary;

  return (
    <div className="flex flex-col gap-4">
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/[0.04]">
        <div className="border-b border-border bg-surface-muted/40 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Power className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Survey sending</h2>
            </div>
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${sendingStatusTone}`}>
              {sendingStatusLabel}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Global stop for survey emails. When off, neither live nor test messages can send.
          </p>
        </div>
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <p className="text-sm text-foreground">{sendingStatusDetail}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              App switch: {sendingAppEnabled ? "on" : "off"} · Deployment master:{" "}
              {sendingMasterEnabled ? "on" : "off"}
            </p>
            {sendingFeedback && (
              <p
                className={
                  "mt-1 text-xs " +
                  (sendingFeedback.tone === "ok"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive")
                }
              >
                {sendingFeedback.text}
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={sendingToggleSaving}
            onClick={() => void toggleSurveySending()}
            className={
              "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 " +
              (sendingAppEnabled
                ? "border border-border bg-background text-foreground hover:bg-surface-muted/60"
                : "bg-accent text-accent-foreground hover:opacity-95")
            }
          >
            {sendingToggleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
            {sendingAppEnabled ? "Turn off" : "Turn on"}
          </button>
        </div>
        <div className="flex items-start gap-2 border-t border-border px-4 py-3 text-sm sm:px-5">
          {schedulerHealthy ? (
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
          ) : (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
          )}
          <div className="min-w-0">
            <p className="font-medium text-foreground">
              {schedulerHealthy ? "Scheduler healthy" : "Scheduler needs attention"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{schedulerHealthDetail}</p>
            {schedulerHealth?.lastError && (
              <p className="mt-1 break-words text-xs text-destructive">
                Last issue: {schedulerHealth.lastError}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/[0.04]">
        <div className="border-b border-border bg-surface-muted/40 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Email schedule</h2>
            </div>
            <span
              className={
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium " +
                (scheduleDirty
                  ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300")
              }
            >
              {scheduleDirty ? "Unsaved changes" : "Saved"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Timing changes do not turn survey sending on.
          </p>
        </div>

        {schedule && (
          <div className="px-4 py-4 sm:px-5">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-foreground">Initial survey</span>
                <select
                  value={schedule.initialDelayHours}
                  disabled={scheduleSaving}
                  onChange={(e) => {
                    setScheduleFeedback(null);
                    setSchedule({ ...schedule, initialDelayHours: Number(e.target.value) });
                  }}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground disabled:opacity-50"
                >
                  {Array.from({ length: 23 }, (_, index) => index + 2).map((hours) => (
                    <option key={hours} value={hours}>
                      {hours} hours after last appointment
                    </option>
                  ))}
                </select>
                <span className="mt-1.5 block text-xs text-muted-foreground">
                  Allowed window: 2–24 hours after the last appointment of the day.
                </span>
              </label>

              <fieldset disabled={scheduleSaving}>
                <legend className="text-sm font-medium text-foreground">Final reminder</legend>
                <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-background p-1">
                  {[14, 21].map((days) => {
                    const selected = schedule.finalReminderDays === days;
                    return (
                      <button
                        key={days}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setScheduleFeedback(null);
                          setSchedule({ ...schedule, finalReminderDays: days });
                        }}
                        className={
                          "rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-50 " +
                          (selected
                            ? "bg-accent text-accent-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-surface-muted/60 hover:text-foreground")
                        }
                      >
                        {days === 14 ? "2 weeks" : "3 weeks"}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">After the initial survey was sent.</p>
              </fieldset>
            </div>

            <div className="mt-5 border-y border-border py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery timeline</p>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
                {[
                  ["Initial survey", `${schedule.initialDelayHours} hours`, "after last appointment"],
                  ["Reminder 1", "Day 3", "fixed"],
                  ["Reminder 2", "Day 7", "fixed"],
                  ["Final reminder", `Day ${schedule.finalReminderDays}`, "2 or 3 weeks"],
                ].map(([label, value, detail]) => (
                  <div key={label} className="min-w-0">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-base font-semibold text-foreground">{value}</p>
                    <p className="text-xs text-muted-foreground">{detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                {displayedScheduleSummary && (
                  <p className="text-xs text-muted-foreground">{displayedScheduleSummary}</p>
                )}
                {scheduleFeedback && (
                  <p
                    className={
                      "mt-1 text-sm " +
                      (scheduleFeedback.tone === "ok"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-destructive")
                    }
                  >
                    {scheduleFeedback.text}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  title="Discard schedule changes"
                  aria-label="Discard schedule changes"
                  disabled={scheduleSaving || !scheduleDirty || !savedSchedule}
                  onClick={() => {
                    if (!savedSchedule) return;
                    setSchedule(savedSchedule);
                    setScheduleFeedback(null);
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-surface-muted/60 hover:text-foreground disabled:opacity-40"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={scheduleSaving || !scheduleDirty || !scheduleValid}
                  onClick={() => void saveSchedule()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition hover:opacity-95 disabled:opacity-40"
                >
                  {scheduleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save schedule
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-amber-400/50 bg-amber-50/80 shadow-sm ring-1 ring-amber-500/10 dark:border-amber-400/30 dark:bg-amber-400/10">
        <div className="border-b border-amber-400/30 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-amber-700 dark:text-amber-200" />
              <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-50">
                Dev: survey email test prep
              </h2>
            </div>
            <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-900 dark:text-amber-100">
              Test only
            </span>
          </div>
          <p className="mt-1 text-xs text-amber-900/75 dark:text-amber-100/75">
            Prepare Kim&apos;s test row for cron testing, then run the same scheduled check used by the local cron path.
          </p>
        </div>
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-900/70 dark:text-amber-100/70">
                Test recipient
              </span>
              <input
                type="email"
                value={prepEmail}
                onChange={(e) => {
                  setPrepEmail(e.target.value);
                  prepEmailRef.current = e.target.value;
                }}
                onBlur={(e) => void loadPrepState(e.currentTarget.value)}
                className="mt-1 w-full rounded-lg border border-amber-400/40 bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-900/70 dark:text-amber-100/70">
                Patient name
              </span>
              <input
                type="text"
                value={prepName}
                onChange={(e) => setPrepName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-amber-400/40 bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <div className="rounded-lg border border-amber-400/35 bg-background/75 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/70 dark:text-amber-100/70">
                Next action due
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {prepState?.nextAction ? formatWhen(prepState.nextAction.dueAt) : "No test row prepared"}
              </p>
              {prepState?.nextAction && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {prepState.nextAction.stageLabel}
                  {prepState.nextAction.isManual ? " · manual" : ""}
                  {prepNextIsDue ? " · due now" : " · not due yet"}
                </p>
              )}
            </div>
            <label className="block rounded-lg border border-amber-400/35 bg-background/75 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-900/70 dark:text-amber-100/70">
                Prep due in
              </span>
              <span className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={prepDueInMinutes}
                  onChange={(e) => setPrepDueInMinutes(Number(e.target.value))}
                  className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">Use 0 for due now, or 30 for a timed test.</span>
            </label>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/70 dark:text-amber-100/70">
              Start a scenario
            </p>
            <div className="mt-2 grid gap-2">
              {PREP_SCENARIOS.map((scenario) => (
                <button
                  key={scenario.value}
                  type="button"
                  disabled={prepBusy !== null}
                  onClick={() => void prepareScenario(scenario.value)}
                  className="flex items-center gap-3 rounded-lg border border-amber-400/40 bg-background/80 px-3 py-2 text-left transition hover:bg-background disabled:opacity-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/20 text-amber-800 dark:text-amber-100">
                    {prepBusy === scenario.value ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarClock className="h-4 w-4" />
                    )}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-foreground">{scenario.label}</span>
                    <span className="block text-xs text-muted-foreground">{scenario.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/70 dark:text-amber-100/70">
              Step current test row
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={localSchedulerChecking}
                onClick={() => void runLocalSchedulerCheck()}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-amber-500/10 disabled:opacity-50"
              >
                {localSchedulerChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Run cron now
              </button>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={localSchedulerEnabled}
                  onChange={(e) => setLocalSchedulerEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-amber-500/50"
                />
                Auto-check every minute
              </label>
              {(localSchedulerFeedback || prepFeedback) && (
                <p
                  className={
                    "text-sm " +
                    ((localSchedulerFeedback ?? prepFeedback)?.tone === "ok"
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-destructive")
                  }
                >
                  {(localSchedulerFeedback ?? prepFeedback)?.text}
                </p>
              )}
            </div>
            {localSchedulerLastRun && (
              <p className="mt-2 text-xs text-muted-foreground">Last checked {formatWhen(localSchedulerLastRun)}</p>
            )}
            <p className="mt-2 text-xs text-amber-900/75 dark:text-amber-100/75">
              Live sending remains controlled by the switches above. This prep area only creates test rows.
            </p>
          </div>
        </div>
      </section>

      {(suppressedEmails > 0 || recalledRows > 0) && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 sm:px-5">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            {suppressedEmails} email address(es) suppressed · {recalledRows} outreach row(s) recalled
          </p>
          <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90">
            Future survey and reminder emails are blocked for these patients. Messages already delivered cannot be removed from inboxes.
          </p>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/[0.04]">
        <div className="border-b border-border bg-surface-muted/40 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Emails sent</h2>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Survey outreach rows with at least one email delivered.
          </p>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          {stats && (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Initial emails sent", stats.withInitialSent],
                ["Unique recipients", stats.uniqueRecipients],
                ["Production sends", stats.withInitialSent - stats.testRows],
                ["Test sends", stats.testRows],
                ["Send failures", stats.failedRows],
                ["Undelivered emails", bounceSummary?.production ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-border bg-surface-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-semibold text-foreground">{value}</p>
                </div>
              ))}
            </div>
          )}

          {bounces.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-amber-500/30">
              <div className="flex flex-col gap-1 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                  <h3 className="text-sm font-semibold text-foreground">Undelivered emails</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  {bounceSummary?.production ?? 0} production · {bounceSummary?.tests ?? 0} test
                  {(bounceSummary?.unmatched ?? 0) > 0 ? ` · ${bounceSummary?.unmatched} unmatched` : ""}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-surface-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Recipient</th>
                      <th className="px-3 py-2 font-medium">Message</th>
                      <th className="px-3 py-2 font-medium">Reported</th>
                      <th className="px-3 py-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bounces.map((bounce) => (
                      <tr key={bounce.id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2">
                          <span className="text-foreground">{bounce.recipientEmail ?? "Unknown recipient"}</span>
                          <span className="mt-0.5 block text-[10px] font-medium uppercase text-muted-foreground">
                            {bounce.isTest ? "Test" : bounce.matched ? "Production" : "Unmatched"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs capitalize text-muted-foreground">
                          {bounce.stage ? bounce.stage.replace("reminder", "Reminder ") : "Unknown stage"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                          {formatWhen(bounce.receivedAt)}
                        </td>
                        <td className="min-w-64 px-3 py-2 text-xs text-muted-foreground">
                          <span className="text-foreground">{bounce.reason}</span>
                          {bounce.statusCode && <span className="ml-1 font-mono">({bounce.statusCode})</span>}
                          {bounce.hardBounce && (
                            <span className="mt-1 block text-[10px] font-medium uppercase text-amber-700 dark:text-amber-300">
                              Future reminders stopped
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1">
              <span className="text-xs font-medium text-muted-foreground">Search</span>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setOffset(0);
                      setSearch(searchInput.trim());
                    }
                  }}
                  placeholder="Email or patient name"
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
                />
              </div>
            </label>
            <label>
              <span className="text-xs font-medium text-muted-foreground">Type</span>
              <select
                value={testFilter}
                onChange={(e) => {
                  setOffset(0);
                  setTestFilter(e.target.value as "all" | "prod" | "test");
                }}
                className="mt-1 block rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="prod">Production only</option>
                <option value="test">Test only</option>
                <option value="all">All</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setOffset(0);
                setSearch(searchInput.trim());
              }}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-muted/50"
            >
              Search
            </button>
          </div>

          {sentFeedback && <p className="text-sm text-destructive">{sentFeedback.text}</p>}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Patient</th>
                  <th className="px-3 py-2 font-medium">Visit</th>
                  <th className="px-3 py-2 font-medium">Initial sent</th>
                  <th className="px-3 py-2 font-medium">Stages</th>
                  <th className="px-3 py-2 font-medium">Next scheduled</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sentLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      No sent emails match this filter.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`View sent email details for ${row.patientName}`}
                      onClick={() => setSelectedRowId(row.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedRowId(row.id);
                        }
                      }}
                      className="cursor-pointer border-b border-border/60 transition hover:bg-surface-muted/40 focus-visible:bg-surface-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 last:border-0"
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium text-foreground">{row.patientName}</p>
                        <p className="text-xs text-muted-foreground">{row.patientEmail}</p>
                        {row.isTest && (
                          <span className="mt-1 inline-block rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-violet-700 dark:text-violet-300">
                            Test
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {row.appointmentDate ?? "—"}
                        {row.appointmentCount > 1 && (
                          <span className="block text-[10px]">{row.appointmentCount} appointments</span>
                        )}
                        {row.crmAppointmentId && (
                          <span className="block font-mono text-[10px]">CRM {row.crmAppointmentId}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">{formatWhen(row.initialSentAt)}</td>
                      <td className="px-3 py-2 text-xs">{row.stagesSent}</td>
                      <td className="px-3 py-2 text-xs">
                        {row.nextScheduledMessage ? (
                          <>
                            <span className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                              {row.nextScheduledMessage.stageLabel}
                              {row.nextScheduledMessage.isManual && (
                                <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-accent">
                                  Manual
                                </span>
                              )}
                            </span>
                            <span className="text-muted-foreground">{formatWhen(row.nextScheduledMessage.dueAt)}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs capitalize text-muted-foreground">
                        <span className="block">{row.completedAt ? "completed" : row.status}</span>
                        <span className="mt-1 block text-[10px] font-medium uppercase text-accent">View details</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              Page {page} of {pageCount} · {total} row{total === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={offset <= 0 || sentLoading}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={offset + PAGE_SIZE >= total || sentLoading}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </section>
      {selectedRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sent-email-detail-title"
          onClick={() => setSelectedRowId(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border bg-surface-muted/40 px-4 py-3 sm:px-5">
              <div>
                <h2 id="sent-email-detail-title" className="text-sm font-semibold text-foreground">
                  Sent email details
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedRow.patientName} · {selectedRow.patientEmail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRowId(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                aria-label="Close sent email details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-4 py-4 sm:px-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-surface-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    {selectedRow.appointmentCount > 1 ? "Appointments" : "Visit"}
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">{selectedRow.appointmentDate ?? "—"}</p>
                  {selectedRow.appointmentAt && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Last appointment: {formatWhen(selectedRow.appointmentAt)}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-border bg-surface-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="mt-1 text-sm font-medium capitalize text-foreground">
                    {selectedRow.completedAt ? "completed" : selectedRow.status}
                  </p>
                  {selectedRow.completedAt && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatWhen(selectedRow.completedAt)}</p>
                  )}
                </div>
                <div className="rounded-lg border border-border bg-surface-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {selectedRow.isTest ? "Test email" : "Production email"}
                  </p>
                  {selectedRow.crmAppointmentId && (
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">CRM {selectedRow.crmAppointmentId}</p>
                  )}
                  {selectedRow.providerNames.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedRow.providerNames.join(", ")}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground">Sent messages</h3>
                <div className="mt-2 overflow-hidden rounded-lg border border-border">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-border bg-surface-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Message</th>
                        <th className="px-3 py-2 font-medium">Sent at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStageDetails.map((stage) => (
                        <tr key={stage.label} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2 font-medium text-foreground">{stage.label}</td>
                          <td className="px-3 py-2 text-muted-foreground">{formatWhen(stage.sentAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface-muted/30 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Next survey message</p>
                {selectedRow.nextScheduledMessage ? (
                  <>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-foreground">
                        {selectedRow.nextScheduledMessage.stageLabel}
                      </p>
                      {selectedRow.nextScheduledMessage.isManual && (
                        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-accent">
                          Manual
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Scheduled for {formatWhen(selectedRow.nextScheduledMessage.dueAt)}
                    </p>
                    {selectedNextIsDue && (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                        This message is due now. Local scheduled checks are {localSchedulerEnabled ? "running" : "paused"}.
                      </p>
                    )}
                    {selectedRow.isTest ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                        <label className="block">
                          <span className="text-xs font-medium text-muted-foreground">Manual next send time</span>
                          <input
                            type="datetime-local"
                            value={manualNextScheduleValue}
                            disabled={manualScheduleSaving}
                            onChange={(e) => setManualNextScheduleValue(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={manualScheduleSaving || !manualNextScheduleValue}
                          onClick={() => void saveManualNextSchedule(manualNextScheduleValue)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
                        >
                          {manualScheduleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save
                        </button>
                        <button
                          type="button"
                          disabled={manualScheduleSaving || !selectedRow.manualNextScheduledAt}
                          onClick={() => void saveManualNextSchedule(null)}
                          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-muted/50 disabled:opacity-50"
                        >
                          Use automatic
                        </button>
                      </div>
                    ) : selectedRow.manualNextScheduledAt ? (
                      <div className="mt-3">
                        <button
                          type="button"
                          disabled={manualScheduleSaving}
                          onClick={() => void saveManualNextSchedule(null)}
                          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-muted/50 disabled:opacity-50"
                        >
                          Use automatic schedule
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedRow.completedAt
                      ? "No next survey is scheduled because the survey is completed."
                      : "No next survey message is currently scheduled."}
                  </p>
                )}
                {manualScheduleFeedback && (
                  <p
                    className={
                      "mt-3 text-sm " +
                      (manualScheduleFeedback.tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")
                    }
                  >
                    {manualScheduleFeedback.text}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
