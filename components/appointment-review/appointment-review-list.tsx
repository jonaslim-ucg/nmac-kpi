"use client";

import { Loader2, MessageSquareText } from "lucide-react";
import { useMemo, useState } from "react";
import type { AppointmentReviewDetail } from "@/lib/appointment-review/display";
import { formatRating, formatReviewWhen } from "@/lib/appointment-review/display";

type Props = {
  reviews: AppointmentReviewDetail[];
  onViewReview: (id: string) => void;
  periodLabel?: string;
  showTestResponses: boolean;
  testResponsesLoading?: boolean;
  onShowTestResponsesChange: (show: boolean) => void;
};

type CommentFilter = "all" | "with-comments";

export function AppointmentReviewList({
  reviews,
  onViewReview,
  periodLabel = "All",
  showTestResponses,
  testResponsesLoading = false,
  onShowTestResponsesChange,
}: Props) {
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("all");

  const filtered = useMemo(() => {
    if (commentFilter === "with-comments") {
      return reviews.filter((r) => r.hasComments);
    }
    return reviews;
  }, [commentFilter, reviews]);
  const liveCount = filtered.filter((review) => !review.isTest).length;
  const testCount = filtered.length - liveCount;

  return (
    <div className="dashboard-card overflow-hidden">
      <span className="dashboard-card-accent" aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <p className="text-sm font-semibold text-foreground">Survey results</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {periodLabel} · {liveCount} live review{liveCount === 1 ? "" : "s"}
            {showTestResponses
              ? ` · ${testCount} test response${testCount === 1 ? "" : "s"} shown`
              : ""}
            {commentFilter === "with-comments" ? " with written responses" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 flex items-center gap-2 rounded-lg border border-border bg-surface-muted/30 px-3 py-1.5">
            <div>
              <p className="text-xs font-medium text-foreground">Show test responses</p>
              <p className="hidden text-[11px] text-muted-foreground lg:block">
                Excluded from live totals and quarterly entries
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showTestResponses}
              aria-label="Show test responses"
              disabled={testResponsesLoading}
              onClick={() => onShowTestResponsesChange(!showTestResponses)}
              className={
                "relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60 " +
                (showTestResponses ? "bg-accent" : "bg-muted-foreground/30")
              }
            >
              <span
                className={
                  "pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-[left] duration-200 ease-out " +
                  (showTestResponses ? "left-[calc(100%-1.375rem)]" : "left-0.5")
                }
                aria-hidden
              />
              {testResponsesLoading ? (
                <Loader2
                  className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-foreground"
                  aria-hidden
                />
              ) : null}
            </button>
          </div>
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
                <th className="px-3 py-3 font-semibold">Provider(s)</th>
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-medium text-foreground">{review.patientName}</p>
                      {review.isTest ? (
                        <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                          Test
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{review.email}</p>
                  </td>
                  <td className="px-3 py-3 font-mono text-foreground">{formatRating(review.appointmentEase)}</td>
                  <td className="px-3 py-3 font-mono text-foreground">{formatRating(review.visitRating)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{review.waitTimeLabel}</td>
                  <td className="max-w-[220px] px-3 py-3">
                    <p className="line-clamp-2 text-foreground">{review.serviceTypeLabel || "—"}</p>
                  </td>
                  <td className="px-3 py-3 font-mono text-foreground">
                    {formatRating(review.recommendationRating)}
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
