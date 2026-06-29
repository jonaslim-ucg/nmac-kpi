"use client";

import { useCallback, useState } from "react";
import {
  APPOINTMENT_REVIEW_MAX_SCORE,
  EMPTY_APPOINTMENT_REVIEW_FORM,
  type AppointmentReviewFormState,
  type AppointmentReviewPayload,
} from "@/lib/appointment-review/types";

function ScaleInput({
  name,
  value,
  onChange,
  minLabel,
  maxLabel,
  disabled,
}: {
  name: string;
  value: number | null;
  onChange: (n: number) => void;
  minLabel: string;
  maxLabel: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={name}>
        {Array.from({ length: APPOINTMENT_REVIEW_MAX_SCORE }, (_, i) => i + 1).map((n) => {
          const selected = value === n;
          return (
            <label
              key={n}
              className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium transition ${
                selected
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-background text-foreground hover:border-accent/50"
              } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={n}
                checked={selected}
                onChange={() => onChange(n)}
                disabled={disabled}
                className="sr-only"
              />
              {n}
            </label>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>1 — {minLabel}</span>
        <span>
          {APPOINTMENT_REVIEW_MAX_SCORE} — {maxLabel}
        </span>
      </div>
    </div>
  );
}

function QuestionBlock({
  number,
  title,
  children,
  required,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-3 text-sm font-medium leading-snug text-foreground">
        <span className="mr-1.5 text-muted-foreground">{number}.</span>
        {title}
        {required ? <span className="ml-0.5 text-red-600 dark:text-red-400">*</span> : null}
      </legend>
      {children}
    </fieldset>
  );
}

function isFormComplete(form: AppointmentReviewFormState): form is AppointmentReviewPayload {
  return (
    form.appointmentEase !== null &&
    form.visitRating !== null &&
    form.providerAndServices.trim().length > 0
  );
}

export function AppointmentReviewForm() {
  const [form, setForm] = useState<AppointmentReviewFormState>(EMPTY_APPOINTMENT_REVIEW_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const patch = useCallback((partial: Partial<AppointmentReviewFormState>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    if (!isFormComplete(form)) {
      setError("Please answer all required questions before submitting.");
      return;
    }

    setBusy(true);
    try {
      const r = await fetch("/api/appointment-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = (await r.json()) as { ok?: boolean; message?: string; error?: string };
      if (!r.ok || !j.ok) {
        setError(j.message ?? j.error ?? "Could not submit your review. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Could not submit your review. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [form]);

  if (submitted) {
    return (
      <div className="rounded-xl border border-border bg-surface-muted/50 p-6 text-center">
        <p className="text-lg font-semibold text-foreground">Thank you</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your feedback helps us improve the care and service we provide. We appreciate you taking the time to share
          your experience.
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <QuestionBlock
        number={1}
        title="How would you rate the ease of scheduling an appointment?"
        required
      >
        <ScaleInput
          name="appointment-ease"
          value={form.appointmentEase}
          onChange={(n) => patch({ appointmentEase: n })}
          minLabel="worst"
          maxLabel="best"
          disabled={busy}
        />
      </QuestionBlock>

      <QuestionBlock
        number={2}
        title="How would you rank your overall visit with our practice?"
        required
      >
        <ScaleInput
          name="visit-rating"
          value={form.visitRating}
          onChange={(n) => patch({ visitRating: n })}
          minLabel="worst"
          maxLabel="best"
          disabled={busy}
        />
      </QuestionBlock>

      <QuestionBlock
        number={3}
        title="Who was your provider and what services did they treat you for (Annual Exam, Cardio Specialist, Weight loss, etc)?"
        required
      >
        <textarea
          rows={3}
          value={form.providerAndServices}
          onChange={(e) => patch({ providerAndServices: e.target.value })}
          disabled={busy}
          placeholder="Provider name and services received…"
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent placeholder:text-muted-foreground/70 focus:ring-2"
        />
      </QuestionBlock>

      <QuestionBlock
        number={4}
        title="How has your health, confidence, or quality of life improved since receiving care from NMAC?"
      >
        <textarea
          rows={4}
          value={form.healthImprovement}
          onChange={(e) => patch({ healthImprovement: e.target.value })}
          disabled={busy}
          placeholder="Share how your care has made a difference (optional)…"
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent placeholder:text-muted-foreground/70 focus:ring-2"
        />
      </QuestionBlock>

      <QuestionBlock
        number={5}
        title="What would you say to someone considering becoming a NMAC patient?"
      >
        <textarea
          rows={4}
          value={form.recommendationMessage}
          onChange={(e) => patch({ recommendationMessage: e.target.value })}
          disabled={busy}
          placeholder="Your message to someone thinking about joining NMAC (optional)…"
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent placeholder:text-muted-foreground/70 focus:ring-2"
        />
      </QuestionBlock>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-accent py-3 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}
