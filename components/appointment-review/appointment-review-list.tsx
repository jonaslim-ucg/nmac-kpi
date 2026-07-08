"use client";

import { MessageSquareText } from "lucide-react";
import { useMemo, useState } from "react";
import type { AppointmentReviewDetail } from "@/lib/appointment-review/display";
import { formatRating, formatReviewWhen } from "@/lib/appointment-review/display";

type Props = {
  reviews: AppointmentReviewDetail[];
  onViewReview: (id: string) => void;
  periodLabel?: string;
};

type CommentFilter = "all" | "with-comments";

export function AppointmentReviewList({ reviews, onViewReview, periodLabel = "All" }: Props) {
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("all");

  const filtered = useMemo(() => {
    if (commentFilter === "with-comments") {
      return reviews.filter((r) => r.hasComments);
    }
    return reviews;
  }, [commentFilter, reviews]);

  return (
    <div className="dashboard-card overflow-hidden">
      <span className="dashboard-card-accent" aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <p className="text-sm font-semibold text-foreground">{periodLabel} reviews</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {filtered.length} review{filtered.length === 1 ? "" : "s"}
            {commentFilter === "with-comments" ? " with written responses" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {(
            [
              { id: "all", label: "All" },
              { id: "with-comments", label: "With responses" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setCommentFilter(id)}
              className={
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition " +
                (commentFilter === id
                  ? "border-accent bg-nav-active-bg text-nav-active-fg"
                  : "border-border bg-card text-muted-foreground hover:text-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted-foreground">
          {commentFilter === "with-comments"
            ? "No reviews with written responses in this period."
            : "No reviews in this period."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-semibold">Submitted</th>
                <th className="px-3 py-3 font-semibold">Patient</th>
                <th className="px-3 py-3 font-semibold">Scheduling</th>
                <th className="px-3 py-3 font-semibold">Visit</th>
                <th className="px-3 py-3 font-semibold">Wait time</th>
                <th className="px-3 py-3 font-semibold">Provider</th>
                <th className="px-3 py-3 font-semibold">Recommend</th>
                <th className="px-3 py-3 font-semibold">Comments</th>
                <th className="px-5 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((review) => (
                <tr
                  key={review.id}
                  className="cursor-pointer border-b border-border/70 transition hover:bg-surface-muted/30"
                  onClick={() => onViewReview(review.id)}
                >
                  <td className="px-5 py-3 text-foreground">{formatReviewWhen(review.createdAt)}</td>
                  <td className="max-w-[160px] px-3 py-3">
                    <p className="font-medium text-foreground">{review.patientName}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{review.email}</p>
                  </td>
                  <td className="px-3 py-3 font-mono text-foreground">{formatRating(review.appointmentEase)}</td>
                  <td className="px-3 py-3 font-mono text-foreground">{formatRating(review.visitRating)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{review.waitTimeLabel}</td>
                  <td className="max-w-[220px] px-3 py-3">
                    <p className="line-clamp-2 text-foreground">{review.serviceTypeLabel || "—"}</p>
                  </td>
                  <td className="px-3 py-3 font-mono text-foreground">
                    {review.recommendationRating !== null ? formatRating(review.recommendationRating) : "—"}
                  </td>
                  <td className="max-w-[220px] px-3 py-3">
                    {review.commentPreview ? (
                      <div className="flex items-start gap-2">
                        <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                        <p className="line-clamp-2 text-foreground">{review.commentPreview}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewReview(review.id);
                      }}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-muted/80"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
