"use client";

import { useCallback, useState } from "react";
import {
  APPOINTMENT_REVIEW_MAX_SCORE,
  EMPTY_APPOINTMENT_REVIEW_FORM,
  PATIENT_DURATION_OPTIONS,
  WAIT_TIME_OPTIONS,
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

function YesNoInput({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-3" role="radiogroup" aria-label={name}>
      {[
        { label: "Yes", v: true },
        { label: "No", v: false },
      ].map(({ label, v }) => {
        const selected = value === v;
        return (
          <label
            key={label}
            className={`flex min-w-[5rem] cursor-pointer items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
              selected
                ? "border-accent bg-accent text-white"
                : "border-border bg-background text-foreground hover:border-accent/50"
            } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <input
              type="radio"
              name={name}
              checked={selected}
              onChange={() => onChange(v)}
              disabled={disabled}
              className="sr-only"
            />
            {label}
          </label>
        );
      })}
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
    form.waitTime !== null &&
    form.visitRating !== null &&
    form.providerTimeAdequate !== null &&
    form.understandDiagnosis !== null &&
    form.clinicalCareRating !== null &&
    form.frontDeskRating !== null &&
    form.isPatient !== null &&
    form.patientDuration !== null &&
    form.recommendLikelihood !== null
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
        title="How would you rate the ease of the appointment?"
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
        title="What was your wait time before the clinical staff brought you to an exam room?"
        required
      >
        <div className="space-y-2" role="radiogroup" aria-label="Wait time">
          {WAIT_TIME_OPTIONS.map(({ value, label }) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition ${
                form.waitTime === value
                  ? "border-accent bg-accent-muted/60"
                  : "border-border bg-background hover:border-accent/40"
              } ${busy ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <input
                type="radio"
                name="wait-time"
                value={value}
                checked={form.waitTime === value}
                onChange={() => patch({ waitTime: value })}
                disabled={busy}
                className="h-4 w-4 accent-accent"
              />
              {label}
            </label>
          ))}
        </div>
      </QuestionBlock>

      <QuestionBlock number={3} title="How was your visit with our practice?" required>
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
        number={4}
        title="My provider spent enough time with me to address my needs and answered all my questions."
        required
      >
        <YesNoInput
          name="provider-time"
          value={form.providerTimeAdequate}
          onChange={(v) => patch({ providerTimeAdequate: v })}
          disabled={busy}
        />
        <label className="mt-4 block text-sm text-muted-foreground">
          Comments (optional)
          <textarea
            rows={3}
            value={form.providerTimeComment}
            onChange={(e) => patch({ providerTimeComment: e.target.value })}
            disabled={busy}
            placeholder="Share any additional feedback about your provider visit…"
            className="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent placeholder:text-muted-foreground/70 focus:ring-2"
          />
        </label>
      </QuestionBlock>

      <QuestionBlock
        number={5}
        title="Upon leaving, I understand my diagnosis and medical treatments recommended by my provider."
        required
      >
        <YesNoInput
          name="understand-diagnosis"
          value={form.understandDiagnosis}
          onChange={(v) => patch({ understandDiagnosis: v })}
          disabled={busy}
        />
      </QuestionBlock>

      <QuestionBlock
        number={6}
        title="I would rate the overall clinical care I received."
        required
      >
        <ScaleInput
          name="clinical-care"
          value={form.clinicalCareRating}
          onChange={(n) => patch({ clinicalCareRating: n })}
          minLabel="worst"
          maxLabel="best"
          disabled={busy}
        />
        <label className="mt-4 block text-sm text-muted-foreground">
          Comments (optional)
          <textarea
            rows={3}
            value={form.clinicalCareComment}
            onChange={(e) => patch({ clinicalCareComment: e.target.value })}
            disabled={busy}
            placeholder="Share any additional feedback about your clinical care…"
            className="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent placeholder:text-muted-foreground/70 focus:ring-2"
          />
        </label>
      </QuestionBlock>

      <QuestionBlock
        number={7}
        title="The front desk staff were friendly and courteous."
        required
      >
        <ScaleInput
          name="front-desk"
          value={form.frontDeskRating}
          onChange={(n) => patch({ frontDeskRating: n })}
          minLabel="worst"
          maxLabel="best"
          disabled={busy}
        />
      </QuestionBlock>

      <QuestionBlock number={8} title="Are you a patient?" required>
        <YesNoInput
          name="is-patient"
          value={form.isPatient}
          onChange={(v) => patch({ isPatient: v })}
          disabled={busy}
        />
      </QuestionBlock>

      <QuestionBlock
        number={9}
        title="How long have you been a patient of this provider?"
        required
      >
        <div className="space-y-2" role="radiogroup" aria-label="Patient duration">
          {PATIENT_DURATION_OPTIONS.map(({ value, label }) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition ${
                form.patientDuration === value
                  ? "border-accent bg-accent-muted/60"
                  : "border-border bg-background hover:border-accent/40"
              } ${busy ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <input
                type="radio"
                name="patient-duration"
                value={value}
                checked={form.patientDuration === value}
                onChange={() => patch({ patientDuration: value })}
                disabled={busy}
                className="h-4 w-4 accent-accent"
              />
              {label}
            </label>
          ))}
        </div>
      </QuestionBlock>

      <QuestionBlock
        number={10}
        title="Would you like to name any staff member that provided exceptional service?"
      >
        <textarea
          rows={3}
          value={form.exceptionalStaffComment}
          onChange={(e) => patch({ exceptionalStaffComment: e.target.value })}
          disabled={busy}
          placeholder="Staff member name and details (optional)…"
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent placeholder:text-muted-foreground/70 focus:ring-2"
        />
      </QuestionBlock>

      <QuestionBlock
        number={11}
        title="Would you like to name any staff member whose service needs improvement?"
      >
        <textarea
          rows={3}
          value={form.improvementStaffComment}
          onChange={(e) => patch({ improvementStaffComment: e.target.value })}
          disabled={busy}
          placeholder="Staff member name and details (optional)…"
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent placeholder:text-muted-foreground/70 focus:ring-2"
        />
      </QuestionBlock>

      <QuestionBlock
        number={12}
        title="How likely are you to recommend us to a friend?"
        required
      >
        <ScaleInput
          name="recommend"
          value={form.recommendLikelihood}
          onChange={(n) => patch({ recommendLikelihood: n })}
          minLabel="least likely"
          maxLabel="highly likely"
          disabled={busy}
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
