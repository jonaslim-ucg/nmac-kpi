"use client";

import { useCallback, useEffect, useState } from "react";
import {
  APPOINTMENT_REVIEW_MAX_SCORE,
  EMPTY_APPOINTMENT_REVIEW_FORM,
  PATIENT_DURATION_OPTIONS,
  REFERRAL_SOURCE_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  TESTIMONIAL_PERMISSION_OPTIONS,
  WAIT_TIME_OPTIONS,
  areProviderRatingsComplete,
  isTestimonialComplete,
  isNewPatientDuration,
  isReferralSourceComplete,
  areServiceTypesComplete,
  serviceTypeLabel,
  type AppointmentReviewFormState,
  type AppointmentReviewPayload,
} from "@/lib/appointment-review/types";
import { isValidEmailFormat } from "@/lib/auth/email-policy";

const APPOINTMENT_REVIEW_SESSION_SUBMITTED_KEY = "nmac-appointment-review-submitted";

function hasSubmittedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(APPOINTMENT_REVIEW_SESSION_SUBMITTED_KEY) === "true";
  } catch {
    return false;
  }
}

function markSubmittedThisSession(): void {
  try {
    window.sessionStorage.setItem(APPOINTMENT_REVIEW_SESSION_SUBMITTED_KEY, "true");
  } catch {
    // Session storage can be unavailable in private/restricted modes.
  }
}

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
  const scores = Array.from({ length: APPOINTMENT_REVIEW_MAX_SCORE }, (_, i) => i + 1);

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5" role="radiogroup" aria-label={name}>
        {scores.map((n) => {
          const selected = value === n;
          return (
            <label
              key={n}
              className={`flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition ${
                selected
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-background text-foreground hover:border-accent/40"
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
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>1 — {minLabel}</span>
        <span className="text-right">
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
    areServiceTypesComplete(form.serviceTypes, form.serviceTypeOther) &&
    areProviderRatingsComplete(form.serviceTypes, form.providerRatings) &&
    form.healthRating !== null &&
    form.recommendationRating !== null &&
    form.testimonialPermission !== null &&
    isTestimonialComplete(form.testimonialPermission, form.testimonialText) &&
    form.waitTime !== null &&
    form.providerTimeAdequate !== null &&
    form.frontDeskRating !== null &&
    form.patientDuration !== null &&
    isReferralSourceComplete(form.patientDuration, form.referralSources, form.referralOther)
  );
}

export function AppointmentReviewForm({ surveyToken = null }: { surveyToken?: string | null }) {
  const [form, setForm] = useState<AppointmentReviewFormState>({
    ...EMPTY_APPOINTMENT_REVIEW_FORM,
    surveyToken,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [linkLoading, setLinkLoading] = useState(Boolean(surveyToken));
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [linkedAppointmentCount, setLinkedAppointmentCount] = useState(1);
  const [linkedProviderNames, setLinkedProviderNames] = useState<string[]>([]);

  useEffect(() => {
    if (!hasSubmittedThisSession()) return;
    setSubmitted(true);
    setLinkLoading(false);
  }, []);

  useEffect(() => {
    if (!surveyToken) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/survey-outreach/lookup?t=${encodeURIComponent(surveyToken)}`, {
          cache: "no-store",
        });
        const j = (await r.json()) as {
          ok?: boolean;
          email?: string;
          patientName?: string;
          completed?: boolean;
          appointmentCount?: number;
          providerNames?: string[];
          error?: string;
        };
        if (cancelled) return;
        if (!r.ok || !j.ok) {
          setError(j.error ?? "This survey link is not valid.");
          return;
        }
        if (j.completed) {
          setAlreadyCompleted(true);
          return;
        }
        setLinkedAppointmentCount(Math.max(Number(j.appointmentCount ?? 1), 1));
        setLinkedProviderNames(Array.isArray(j.providerNames) ? j.providerNames : []);
        setForm((prev) => ({
          ...prev,
          email: j.email ?? prev.email,
          patientName: j.patientName ?? prev.patientName,
          surveyToken,
        }));
      } catch {
        if (!cancelled) setError("Could not load your survey link.");
      } finally {
        if (!cancelled) setLinkLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [surveyToken]);

  const patch = useCallback((partial: Partial<AppointmentReviewFormState>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    if (hasSubmittedThisSession()) {
      setSubmitted(true);
      return;
    }

    if (!isFormComplete(form)) {
      if (form.email.trim() && !isValidEmailFormat(form.email.trim())) {
        setError("Please enter a valid email address.");
        return;
      }
      if (!areServiceTypesComplete(form.serviceTypes, form.serviceTypeOther)) {
        setError(
          form.serviceTypes.includes("other") && !form.serviceTypeOther.trim()
            ? "Please specify the other provider or providers you saw."
            : "Please select at least one provider you saw.",
        );
        return;
      }
      if (!areProviderRatingsComplete(form.serviceTypes, form.providerRatings)) {
        setError("Please rate each provider you selected.");
        return;
      }
      if (!form.testimonialText.trim()) {
        setError("Please write your testimonial before continuing.");
        return;
      }
      if (!form.testimonialPermission) {
        setError("Please choose whether NMAC may use your comments in marketing materials.");
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
        body: JSON.stringify({
          ...form,
          wouldEncouragePatient: null,
          providerTimeComment: "",
          surveyToken: form.surveyToken ?? undefined,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; message?: string; error?: string };
      if (!r.ok || !j.ok) {
        setError(j.message ?? j.error ?? "Could not submit your review. Please try again.");
        return;
      }
      markSubmittedThisSession();
      setSubmitted(true);
    } catch {
      setError("Could not submit your review. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [form]);

  const showReferralQuestion = isNewPatientDuration(form.patientDuration);

  if (linkLoading) {
    return (
      <div className="rounded-xl border border-border bg-surface-muted/50 p-6 text-center text-sm text-muted-foreground">
        Loading your survey…
      </div>
    );
  }

  if (alreadyCompleted) {
    return (
      <div className="rounded-xl border border-border bg-surface-muted/50 p-6 text-center">
        <p className="text-lg font-semibold text-foreground">Thank you</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          We already received your feedback for this visit. We appreciate you taking the time to share your experience.
        </p>
      </div>
    );
  }

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
      <section className="rounded-xl border border-amber-400/40 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-50">
        <p className="text-sm font-semibold">Quarterly gift voucher draw</p>
        <p className="mt-1 text-sm leading-relaxed text-amber-900/85 dark:text-amber-100/85">
          Complete this testimonial survey to be automatically entered into our quarterly draw for a chance to win one
          of two $100 gift vouchers.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface-muted/40 p-4">
        <h2 className="text-sm font-semibold text-foreground">Contact information</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => patch({ email: e.target.value })}
              disabled={busy}
              readOnly={Boolean(surveyToken)}
              autoComplete="email"
              placeholder="you@example.com"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent placeholder:text-muted-foreground/70 read-only:bg-surface-muted/40 focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Name</span>
            <input
              type="text"
              value={form.patientName}
              onChange={(e) => patch({ patientName: e.target.value })}
              disabled={busy}
              autoComplete="name"
              placeholder="Your full name"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent placeholder:text-muted-foreground/70 read-only:bg-surface-muted/40 focus:ring-2"
            />
          </label>
        </div>
      </section>

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

      <QuestionBlock number={3} title="Which provider(s) did they see? (Select all that apply)" required>
        {linkedAppointmentCount > 1 ? (
          <div className="mb-3 rounded-lg border border-border bg-surface-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            This survey covers {linkedAppointmentCount} appointments from that day.
            {linkedProviderNames.length > 0 ? ` Providers listed: ${linkedProviderNames.join(", ")}.` : ""}
          </div>
        ) : null}
        <div className="space-y-2" role="group" aria-label="Providers seen">
          {SERVICE_TYPE_OPTIONS.map(({ value, label }) => {
            const checked = form.serviceTypes.includes(value);
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
                  value={value}
                  checked={checked}
                  onChange={() => {
                    const serviceTypes = checked
                      ? form.serviceTypes.filter((provider) => provider !== value)
                      : [...form.serviceTypes, value];
                    const providerRatings = { ...form.providerRatings };
                    if (checked) delete providerRatings[value];
                    patch({
                      serviceTypes,
                      providerRatings,
                      ...(value === "other" && checked ? { serviceTypeOther: "" } : {}),
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
        {form.serviceTypes.includes("other") ? (
          <input
            type="text"
            value={form.serviceTypeOther}
            onChange={(e) => patch({ serviceTypeOther: e.target.value })}
            disabled={busy}
            placeholder="Please specify the other provider(s)…"
            className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent placeholder:text-muted-foreground/70 focus:ring-2"
          />
        ) : null}
      </QuestionBlock>

      <QuestionBlock number={4} title="How would you rate each provider?" required>
        {form.serviceTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Select your provider or providers in question 3 first.</p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {form.serviceTypes.map((serviceType) => (
              <div key={serviceType} className="py-4 first:pt-0 last:pb-0">
                <p className="mb-2 text-sm font-medium text-foreground">
                  {serviceTypeLabel(serviceType, serviceType === "other" ? form.serviceTypeOther : "")}
                </p>
                <ScaleInput
                  name={`provider-rating-${serviceType}`}
                  value={form.providerRatings[serviceType] ?? null}
                  onChange={(score) =>
                    patch({ providerRatings: { ...form.providerRatings, [serviceType]: score } })
                  }
                  minLabel="poor"
                  maxLabel="excellent"
                  disabled={busy}
                />
              </div>
            ))}
          </div>
        )}
      </QuestionBlock>

      <p className="border-t border-border pt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Care outcomes
      </p>

      <QuestionBlock
        number={5}
        title="Since receiving care at NMAC, how would you rate the improvement in your overall health?"
        required
      >
        <ScaleInput
          name="health-rating"
          value={form.healthRating}
          onChange={(n) => patch({ healthRating: n })}
          minLabel="no improvement"
          maxLabel="significant improvement"
          disabled={busy}
        />
      </QuestionBlock>

      <p className="border-t border-border pt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Recommendation
      </p>

      <QuestionBlock
        number={6}
        title="How likely are you to recommend NMAC to a friend or family member?"
        required
      >
        <ScaleInput
          name="recommendation-rating"
          value={form.recommendationRating}
          onChange={(n) => patch({ recommendationRating: n })}
          minLabel="not at all likely"
          maxLabel="extremely likely"
          disabled={busy}
        />
      </QuestionBlock>

      <QuestionBlock
        number={7}
        title="We would love for you to write us a customer/patient testimonial! Write your response below and indicate if we can use your comments as a testimonial in our marketing materials."
        required
      >
        <label className="block rounded-lg border border-accent/30 bg-accent-muted/30 p-4">
          <span className="text-sm font-semibold text-foreground">
            Your testimonial
            <span className="ml-0.5 text-red-600 dark:text-red-400">*</span>
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            Tell us what you would like others to know about your experience. You can choose how NMAC may use your
            comments below.
          </span>
          <textarea
            value={form.testimonialText}
            onChange={(e) => patch({ testimonialText: e.target.value })}
            disabled={busy}
            required
            maxLength={2000}
            rows={4}
            placeholder="Tell us what you would like others to know about your experience..."
            className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none ring-accent placeholder:text-muted-foreground/70 focus:ring-2"
          />
          <span className="mt-1 block text-right text-xs tabular-nums text-muted-foreground">
            {form.testimonialText.length}/2000
          </span>
        </label>
        <p className="mb-2 mt-4 text-sm font-semibold text-foreground">
          May NMAC use your comments in marketing materials?
          <span className="ml-0.5 text-red-600 dark:text-red-400">*</span>
        </p>
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
        number={8}
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
        number={9}
        title="The provider(s) I saw spent enough time with me to address my needs and answered all my questions."
        required
      >
        <YesNoInput
          name="provider-time"
          value={form.providerTimeAdequate}
          onChange={(v) => patch({ providerTimeAdequate: v })}
          disabled={busy}
        />
      </QuestionBlock>

      <QuestionBlock number={10} title="The front desk staff were friendly and courteous." required>
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
        number={11}
        title="How long have you been a patient at NMAC?"
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
          number={12}
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
        number={showReferralQuestion ? 13 : 12}
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
