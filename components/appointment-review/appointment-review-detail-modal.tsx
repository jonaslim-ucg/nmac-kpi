"use client";

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquareText,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AppointmentReviewDetail } from "@/lib/appointment-review/display";
import {
  APPOINTMENT_REVIEW_ACTION_STATUS_OPTIONS,
  EMPTY_APPOINTMENT_REVIEW_MANAGEMENT,
  type AppointmentReviewActionStatus,
  type AppointmentReviewManagement,
} from "@/lib/appointment-review/management";
import {
  formatAppointmentDate,
  formatAppointmentTime,
  formatRating,
  formatRatingOrDash,
  formatReviewWhen,
  formatYesNoOrDash,
  getAppointmentReviewWrittenResponses,
} from "@/lib/appointment-review/display";

type Props = {
  review: AppointmentReviewDetail;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onManagementSaved: (management: AppointmentReviewManagement) => void;
};

function Answer({
  label,
  value,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 border-b border-border/70 py-3 ${className}`}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 break-words text-sm leading-relaxed text-foreground">{value}</div>
    </div>
  );
}

function CommentBlock({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div className="border-l-2 border-accent/70 py-1 pl-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm leading-relaxed text-foreground">{text}</p>
    </div>
  );
}

export function AppointmentReviewDetailModal({
  review,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onManagementSaved,
}: Props) {
  const writtenResponses = getAppointmentReviewWrittenResponses(review);
  const management = review.feedbackManagement ?? EMPTY_APPOINTMENT_REVIEW_MANAGEMENT;
  const [responsiblePerson, setResponsiblePerson] = useState(management.responsiblePerson);
  const [status, setStatus] = useState<AppointmentReviewActionStatus>(management.status);
  const [notes, setNotes] = useState(management.notes);
  const [savingManagement, setSavingManagement] = useState(false);
  const [managementError, setManagementError] = useState<string | null>(null);
  const [managementSaved, setManagementSaved] = useState(false);
  const managementDirty = responsiblePerson.trim() !== management.responsiblePerson
    || status !== management.status
    || notes.trim() !== management.notes;

  useEffect(() => {
    setResponsiblePerson(management.responsiblePerson);
    setStatus(management.status);
    setNotes(management.notes);
    setManagementError(null);
    setManagementSaved(false);
  }, [management.notes, management.responsiblePerson, management.status, review.id]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      const target = e.target;
      const editing = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement;
      if (editing) return;
      if (e.key === "ArrowLeft" && hasPrev && onPrev) onPrev();
      if (e.key === "ArrowRight" && hasNext && onNext) onNext();
    },
    [hasNext, hasPrev, onClose, onNext, onPrev],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  async function saveManagement() {
    if (savingManagement || !managementDirty) return;
    setSavingManagement(true);
    setManagementError(null);
    setManagementSaved(false);
    try {
      const response = await fetch("/api/admin/appointment-reviews", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: review.id,
          responsiblePerson,
          status,
          notes,
        }),
      });
      const data = (await response.json()) as {
        management?: AppointmentReviewManagement;
        error?: string;
      };
      if (!response.ok || !data.management) {
        throw new Error(data.error ?? "Could not save feedback management.");
      }
      onManagementSaved(data.management);
      setResponsiblePerson(data.management.responsiblePerson);
      setStatus(data.management.status);
      setNotes(data.management.notes);
      setManagementSaved(true);
    } catch (error) {
      setManagementError(error instanceof Error ? error.message : "Could not save feedback management.");
    } finally {
      setSavingManagement(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close review" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-detail-title"
        className="relative z-10 flex max-h-[min(92dvh,52rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 id="review-detail-title" className="text-base font-semibold text-foreground">
                Review details
              </h2>
              {review.isTest ? (
                <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                  Test response
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{formatReviewWhen(review.createdAt)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:bg-surface-muted/80 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <section aria-labelledby="review-visit-heading">
            <h3 id="review-visit-heading" className="text-sm font-semibold text-foreground">
              Patient and visit
            </h3>
            <div className="mt-1 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <Answer label="Name" value={review.patientName} />
              <Answer label="Email" value={review.email} />
              <Answer label="Appointment date" value={formatAppointmentDate(review.appointmentDate)} />
              <Answer label="Appointment time" value={formatAppointmentTime(review.appointmentAt)} />
              <Answer
                label="Appointment provider(s)"
                value={review.appointmentProviderNames.length > 0
                  ? review.appointmentProviderNames.join(", ")
                  : "—"}
              />
              <Answer
                label="Visit type"
                value={review.appointmentVisitTypes.length > 0
                  ? review.appointmentVisitTypes.join(", ")
                  : "—"}
              />
            </div>
          </section>

          <section
            className="mt-6 rounded-xl border border-accent/25 bg-accent/5 p-4"
            aria-labelledby="review-management-heading"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
                  <h3 id="review-management-heading" className="text-sm font-semibold text-foreground">
                    Feedback management
                  </h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Internal handling details · visible to signed-in staff only
                </p>
              </div>
              {managementSaved ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Saved
                </span>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Responsible person
                <input
                  type="text"
                  value={responsiblePerson}
                  maxLength={120}
                  onChange={(event) => {
                    setResponsiblePerson(event.target.value);
                    setManagementSaved(false);
                  }}
                  placeholder="Staff member or team"
                  className="mt-1.5 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Status
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as AppointmentReviewActionStatus);
                    setManagementSaved(false);
                  }}
                  className="mt-1.5 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                >
                  {APPOINTMENT_REVIEW_ACTION_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground sm:col-span-2">
                Internal notes/comments
                <textarea
                  value={notes}
                  maxLength={5_000}
                  rows={4}
                  onChange={(event) => {
                    setNotes(event.target.value);
                    setManagementSaved(false);
                  }}
                  placeholder="Record the response, follow-up, or action taken…"
                  className="mt-1.5 w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-xs text-muted-foreground">
                {management.updatedAt ? (
                  <span>
                    Last updated {formatReviewWhen(management.updatedAt)}
                    {management.updatedBy ? ` by ${management.updatedBy}` : ""}
                  </span>
                ) : (
                  <span>No handling activity recorded yet.</span>
                )}
                {managementError ? (
                  <p className="mt-1 font-medium text-red-600 dark:text-red-400" role="alert">
                    {managementError}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={savingManagement || !managementDirty}
                onClick={() => void saveManagement()}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {savingManagement ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="h-4 w-4" aria-hidden />
                )}
                {savingManagement ? "Saving" : "Save handling"}
              </button>
            </div>
          </section>

          <section className="mt-6" aria-labelledby="review-answers-heading">
            <h3 id="review-answers-heading" className="text-sm font-semibold text-foreground">
              Survey responses
            </h3>
            <div className="mt-1 grid grid-cols-1 gap-x-8 lg:grid-cols-2">
              <Answer
                label="1. Ease of scheduling an appointment"
                value={formatRating(review.appointmentEase)}
              />
              <Answer
                label="2. Overall visit with our practice"
                value={formatRating(review.visitRating)}
              />
              <Answer label="3. Which provider(s) did they see?" value={review.serviceTypeLabel} />
              <Answer
                className="lg:row-span-2"
                label="4. Provider ratings"
                value={
                  review.providerRatings.length > 0 ? (
                    <span className="block space-y-1">
                      {review.providerRatings.map(({ providerLabel, rating }) => (
                        <span key={providerLabel} className="flex items-start justify-between gap-4">
                          <span>{providerLabel}</span>
                          <span className="shrink-0 font-medium tabular-nums">{formatRating(rating)}</span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    formatRatingOrDash(review.providerRating)
                  )
                }
              />
              <Answer
                label="5. Overall health improvement since receiving care at NMAC"
                value={formatRatingOrDash(review.healthRating)}
              />
              <Answer
                label="6. Likelihood to recommend NMAC"
                value={formatRatingOrDash(review.recommendationRating)}
              />
              <Answer
                label="7. Testimonial permission"
                value={review.testimonialPermissionLabel}
              />
              <Answer label="8. Wait time before exam room" value={review.waitTimeLabel} />
              <Answer
                label="9. Provider(s) spent enough time and answered questions"
                value={formatYesNoOrDash(review.providerTimeAdequate)}
              />
              <Answer
                label="10. Front desk staff were friendly and courteous"
                value={formatRating(review.frontDeskRating)}
              />
              <Answer
                label="11. How long they have been a patient at NMAC"
                value={review.patientDurationLabel}
              />
              {review.referralSourcesLabel ? (
                <Answer label="12. How did you hear about NMAC" value={review.referralSourcesLabel} />
              ) : null}
            </div>
          </section>

          <section className="mt-6 border-t border-border pt-4" aria-labelledby="review-comments-heading">
            <div
              id="review-comments-heading"
              className="flex items-center gap-2 text-sm font-semibold text-foreground"
            >
              <MessageSquareText className="h-4 w-4 text-accent" aria-hidden />
              Customer written answers
            </div>
            <div className="mt-4 space-y-4">
              {writtenResponses.map((answer) => (
                <CommentBlock key={answer.id} label={answer.label} text={answer.text} />
              ))}
              {writtenResponses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No written answers were provided.</p>
              ) : null}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!hasPrev}
              onClick={onPrev}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-surface-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Previous
            </button>
            <button
              type="button"
              disabled={!hasNext}
              onClick={onNext}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-surface-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-95 sm:w-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
