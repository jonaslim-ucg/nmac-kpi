"use client";

import { ChevronLeft, ChevronRight, MessageSquareText, X } from "lucide-react";
import { useCallback, useEffect } from "react";
import type { AppointmentReviewDetail } from "@/lib/appointment-review/display";
import {
  formatRating,
  formatRatingOrDash,
  formatReviewWhen,
  formatYesNo,
  formatYesNoOrDash,
} from "@/lib/appointment-review/display";

type Props = {
  review: AppointmentReviewDetail;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
};

function Answer({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

function CommentBlock({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div className="rounded-lg border border-border bg-surface-muted/40 px-4 py-3">
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
}: Props) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev && onPrev) onPrev();
      if (e.key === "ArrowRight" && hasNext && onNext) onNext();
    },
    [hasNext, hasPrev, onClose, onNext, onPrev],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close review" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-detail-title"
        className="relative z-10 flex max-h-[min(92dvh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="review-detail-title" className="text-base font-semibold text-foreground">
              Review details
            </h2>
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          <div className="divide-y divide-border">
            <Answer label="1. Email address" value={review.email} />
            <Answer label="2. Patient name" value={review.patientName} />
            <Answer
              label="3. Ease of scheduling an appointment"
              value={formatRating(review.appointmentEase)}
            />
            <Answer label="4. Overall visit with our practice" value={formatRating(review.visitRating)} />
            <Answer label="5. Provider seen" value={review.serviceTypeLabel} />
            <Answer label="6. Provider rating" value={formatRatingOrDash(review.providerRating)} />
            <Answer label="7. Overall health improvement" value={formatRatingOrDash(review.healthRating)} />
            <Answer
              label="8. Likelihood to recommend NMAC"
              value={formatRatingOrDash(review.recommendationRating)}
            />
            <Answer
              label="9. Would encourage someone to become a patient"
              value={formatYesNoOrDash(review.wouldEncouragePatient)}
            />
            <Answer
              label="10. Testimonial permission"
              value={review.testimonialPermissionLabel}
            />
            <Answer label="11. Wait time before exam room" value={review.waitTimeLabel} />
            <Answer
              label="12. Provider spent enough time and answered questions"
              value={formatYesNo(review.providerTimeAdequate)}
            />
            <Answer label="13. Front desk staff" value={formatRating(review.frontDeskRating)} />
            <Answer label="14. How long a patient" value={review.patientDurationLabel} />
            {review.referralSourcesLabel ? (
              <Answer label="15. How did you hear about NMAC" value={review.referralSourcesLabel} />
            ) : null}
          </div>

          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageSquareText className="h-4 w-4 text-accent" aria-hidden />
              Optional written responses
            </div>
            <CommentBlock label="12. Provider visit comments" text={review.providerTimeComment} />
            <CommentBlock
              label={review.referralSourcesLabel ? "16. Exceptional staff" : "15. Exceptional staff"}
              text={review.exceptionalStaffComment}
            />
            {!review.hasComments ? (
              <p className="text-sm text-muted-foreground">No optional written responses.</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-4">
          <div className="flex gap-2">
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
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
