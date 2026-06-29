"use client";

import { useCallback, useState } from "react";
import {
  APPOINTMENT_REVIEW_MAX_SCORE,
  EMPTY_APPOINTMENT_REVIEW_FORM,
  PATIENT_DURATION_OPTIONS,
  REFERRAL_SOURCE_OPTIONS,
  TESTIMONIAL_PERMISSION_OPTIONS,
  WAIT_TIME_OPTIONS,
  isNewPatientDuration,
  isReferralSourceComplete,
  type AppointmentReviewFormState,
  type AppointmentReviewPayload,
} from "@/lib/appointment-review/types";
import { isValidEmailFormat } from "@/lib/auth/email-policy";

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
    isValidEmailFormat(form.email.trim()) &&
    form.patientName.trim().length > 0 &&
    form.appointmentEase !== null &&
    form.visitRating !== null &&
    form.providerAndServices.trim().length > 0 &&
    form.testimonialPermission !== null &&
    form.waitTime !== null &&
    form.providerTimeAdequate !== null &&
    form.frontDeskRating !== null &&
    form.patientDuration !== null &&
    isReferralSourceComplete(form.patientDuration, form.referralSources, form.referralOther)
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
      if (form.email.trim() && !isValidEmailFormat(form.email.trim())) {
        setError("Please enter a valid email address.");
        return;
      }
      if (
        form.patientDuration === "new" &&
        !isReferralSourceComplete(form.patientDuration, form.referralSources, form.referralOther)
      ) {
        setError(
          form.referralSources.includes("other") && !form.referralOther.trim()
            ? "Please specify how you heard about NMAC."
            : "Please select at least one option for how you heard about NMAC.",
        );
        return;
      }
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

  const showReferralQuestion = isNewPatientDuration(form.patientDuration);

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
      <QuestionBlock number={1} title="What is your email address?" required>
        <input
          type="email"
          value={form.email}
          onChange={(e) => patch({ email: e.target.value })}
          disabled={busy}
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent placeholder:text-muted-foreground/70 focus:ring-2"
        />
      </QuestionBlock>

      <QuestionBlock number={2} title="What is your name?" required>
        <input
          type="text"
          value={form.patientName}
          onChange={(e) => patch({ patientName: e.target.value })}
          disabled={busy}
          autoComplete="name"
          placeholder="Your full name"
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent placeholder:text-muted-foreground/70 focus:ring-2"
        />
      </QuestionBlock>

      <QuestionBlock
        number={3}
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
        number={4}
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
        number={5}
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
        number={6}
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
        number={7}
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

      <QuestionBlock
        number={8}
        title="May we use your comments as a testimonial in our marketing materials (website, social media, advertisements, and other promotional materials)?"
        required
      >
        <div className="space-y-2" role="radiogroup" aria-label="Testimonial permission">
          {TESTIMONIAL_PERMISSION_OPTIONS.map(({ value, label }) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-sm transition ${
                form.testimonialPermission === value
                  ? "border-accent bg-accent-muted/60"
                  : "border-border bg-background hover:border-accent/40"
              } ${busy ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <input
                type="radio"
                name="testimonial-permission"
                value={value}
                checked={form.testimonialPermission === value}
                onChange={() => patch({ testimonialPermission: value })}
                disabled={busy}
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
              />
              <span className="leading-snug">{label}</span>
            </label>
          ))}
        </div>
      </QuestionBlock>

      <p className="border-t border-border pt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Visit experience
      </p>

      <QuestionBlock
        number={9}
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

      <QuestionBlock
        number={10}
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

      <QuestionBlock number={11} title="The front desk staff were friendly and courteous." required>
        <ScaleInput
          name="front-desk"
          value={form.frontDeskRating}
          onChange={(n) => patch({ frontDeskRating: n })}
          minLabel="worst"
          maxLabel="best"
          disabled={busy}
        />
      </QuestionBlock>

      <QuestionBlock
        number={12}
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
                onChange={() =>
                  patch({
                    patientDuration: value,
                    ...(value !== "new" ? { referralSources: [], referralOther: "" } : {}),
                  })
                }
                disabled={busy}
                className="h-4 w-4 accent-accent"
              />
              {label}
            </label>
          ))}
        </div>
      </QuestionBlock>

      {showReferralQuestion ? (
        <QuestionBlock
          number={13}
          title="How did you hear about NMAC? (Check all that apply)"
          required
        >
          <div className="space-y-2" role="group" aria-label="How did you hear about NMAC">
            {REFERRAL_SOURCE_OPTIONS.map(({ value, label }) => {
              const checked = form.referralSources.includes(value);
              return (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition ${
                    checked
                      ? "border-accent bg-accent-muted/60"
                      : "border-border bg-background hover:border-accent/40"
                  } ${busy ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? form.referralSources.filter((v) => v !== value)
                        : [...form.referralSources, value];
                      patch({
                        referralSources: next,
                        ...(value === "other" && checked ? { referralOther: "" } : {}),
                      });
                    }}
                    disabled={busy}
                    className="h-4 w-4 accent-accent"
                  />
                  {label}
                </label>
              );
            })}
          </div>
          {form.referralSources.includes("other") ? (
            <input
              type="text"
              value={form.referralOther}
              onChange={(e) => patch({ referralOther: e.target.value })}
              disabled={busy}
              placeholder="Please specify…"
              className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent placeholder:text-muted-foreground/70 focus:ring-2"
            />
          ) : null}
        </QuestionBlock>
      ) : null}

      <QuestionBlock
        number={showReferralQuestion ? 14 : 13}
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
