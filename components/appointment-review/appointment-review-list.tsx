"use client";

import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  MessageSquareText,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { SheetData } from "write-excel-file/browser";
import type { AppointmentReviewDetail } from "@/lib/appointment-review/display";
import { appointmentReviewActionStatusLabel } from "@/lib/appointment-review/management";
import {
  formatAppointmentDate,
  formatAppointmentTime,
  formatRating,
  formatReviewWhen,
  formatYesNoOrDash,
  getAppointmentReviewWrittenResponses,
} from "@/lib/appointment-review/display";

type Props = {
  reviews: AppointmentReviewDetail[];
  onViewReview: (id: string) => void;
  periodLabel?: string;
  showTestResponses: boolean;
  testResponsesLoading?: boolean;
  onShowTestResponsesChange: (show: boolean) => void;
};

type CommentFilter = "all" | "with-comments";
type SortOption =
  | "appointment-desc"
  | "appointment-asc"
  | "name-asc"
  | "name-desc"
  | "submitted-desc"
  | "submitted-asc";

const PAGE_SIZE = 10;

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "appointment-desc", label: "Appointment: newest" },
  { value: "appointment-asc", label: "Appointment: oldest" },
  { value: "name-asc", label: "Patient name: A–Z" },
  { value: "name-desc", label: "Patient name: Z–A" },
  { value: "submitted-desc", label: "Submitted: newest" },
  { value: "submitted-asc", label: "Submitted: oldest" },
];

const EXPORT_HEADERS = [
  "Response type",
  "Submitted",
  "Appointment date",
  "Appointment time",
  "Patient name",
  "Email",
  "Appointment provider(s)",
  "Visit type(s)",
  "Action status",
  "Responsible person",
  "Internal notes/comments",
  "1. Ease of scheduling",
  "2. Overall visit",
  "3. Provider(s) selected by customer",
  "4. Provider rating(s)",
  "5. Health improvement rating",
  "Health improvement answer",
  "6. Likelihood to recommend",
  "Recommendation answer",
  "7. Testimonial permission",
  "Testimonial answer",
  "8. Wait time",
  "9. Provider spent enough time",
  "Provider time answer",
  "10. Front desk rating",
  "11. Patient duration",
  "12. Referral source(s)",
  "Exceptional staff answer",
] as const;

const EXPORT_COLUMN_WIDTHS = [
  14, 22, 18, 18, 24, 30, 32, 30, 18, 24, 42, 20, 18, 34, 34, 24, 42, 24, 42, 26,
  42, 18, 28, 42, 22, 22, 30, 42,
] as const;

function protectSpreadsheetValue(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n");
  return /^[=+\-@]/.test(normalized.trimStart()) ? `'${normalized}` : normalized;
}

function exportFileName(periodLabel: string): string {
  const period = periodLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "selected-period";
  return `nmac-survey-answers-${period}.xlsx`;
}

async function downloadSurveyAnswers(
  reviews: AppointmentReviewDetail[],
  periodLabel: string,
): Promise<void> {
  const rows = reviews.map((review) => [
    review.isTest ? "Test" : "Live",
    formatReviewWhen(review.createdAt),
    formatAppointmentDate(review.appointmentDate),
    formatAppointmentTime(review.appointmentAt),
    review.patientName,
    review.email,
    review.appointmentProviderNames.join("; ") || "—",
    review.appointmentVisitTypes.join("; ") || "—",
    review.feedbackManagement
      ? appointmentReviewActionStatusLabel(review.feedbackManagement.status)
      : "Needs review",
    review.feedbackManagement?.responsiblePerson || "—",
    review.feedbackManagement?.notes || "—",
    formatRating(review.appointmentEase),
    formatRating(review.visitRating),
    review.serviceTypeLabel,
    review.providerRatings
      .map(({ providerLabel, rating }) => `${providerLabel}: ${formatRating(rating)}`)
      .join("; ") || formatRating(review.providerRating),
    formatRating(review.healthRating),
    review.healthImprovementComment,
    formatRating(review.recommendationRating),
    review.recommendationMessage,
    review.testimonialPermissionLabel,
    review.testimonialText,
    review.waitTimeLabel,
    formatYesNoOrDash(review.providerTimeAdequate),
    review.providerTimeComment,
    formatRating(review.frontDeskRating),
    review.patientDurationLabel,
    review.referralSourcesLabel ?? "—",
    review.exceptionalStaffComment,
  ]);

  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const headerRow: SheetData[number] = EXPORT_HEADERS.map((value) => ({
    value,
    type: String,
    height: 32,
    fontWeight: "bold" as const,
    textColor: "#FFFFFF",
    backgroundColor: "#1E5BA8",
    alignVertical: "center" as const,
    wrap: true,
    bottomBorderColor: "#163F73",
    bottomBorderStyle: "thin" as const,
  }));
  const answerRows: SheetData = rows.map((row, rowIndex) => row.map((value) => ({
    value: protectSpreadsheetValue(String(value ?? "")),
    type: String,
    height: 36,
    alignVertical: "top" as const,
    wrap: true,
    backgroundColor: rowIndex % 2 === 1 ? "#F2F6FC" : undefined,
    bottomBorderColor: "#D8E2F0",
    bottomBorderStyle: "thin" as const,
  })));
  const sheetData: SheetData = [headerRow, ...answerRows];

  await writeXlsxFile(sheetData, {
    sheet: "Survey answers",
    columns: EXPORT_COLUMN_WIDTHS.map((width) => ({ width })),
    stickyRowsCount: 1,
    showGridLines: false,
    zoomScale: 0.9,
  }, {
    fontFamily: "Aptos",
    fontSize: 11,
  }).toFile(exportFileName(periodLabel));
}

function compareReviews(
  first: AppointmentReviewDetail,
  second: AppointmentReviewDetail,
  sort: SortOption,
): number {
  if (sort.startsWith("appointment")) {
    if (!first.appointmentDate && !second.appointmentDate) {
      return second.createdAt.localeCompare(first.createdAt);
    }
    if (!first.appointmentDate) return 1;
    if (!second.appointmentDate) return -1;
    const order = first.appointmentDate.localeCompare(second.appointmentDate);
    return (sort === "appointment-desc" ? -order : order)
      || second.createdAt.localeCompare(first.createdAt);
  }

  if (sort.startsWith("name")) {
    const order = first.patientName.localeCompare(second.patientName, undefined, {
      sensitivity: "base",
    });
    return (sort === "name-desc" ? -order : order)
      || second.createdAt.localeCompare(first.createdAt);
  }

  const order = first.createdAt.localeCompare(second.createdAt);
  return sort === "submitted-desc" ? -order : order;
}

export function AppointmentReviewList({
  reviews,
  onViewReview,
  periodLabel = "All",
  showTestResponses,
  testResponsesLoading = false,
  onShowTestResponsesChange,
}: Props) {
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("submitted-desc");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => {
    const included = commentFilter === "with-comments"
      ? reviews.filter((review) => review.hasComments)
      : reviews;
    return [...included].sort((first, second) => compareReviews(first, second, sortOption));
  }, [commentFilter, reviews, sortOption]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageReviews = filtered.slice(pageStart, pageStart + PAGE_SIZE);
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
          <button
            type="button"
            disabled={filtered.length === 0 || exporting}
            onClick={() => {
              setExporting(true);
              void downloadSurveyAnswers(filtered, periodLabel).finally(() => setExporting(false));
            }}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:bg-surface-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
            title="Download all matching survey answers as an Excel workbook"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            {exporting ? "Preparing Excel" : "Export Excel"}
          </button>
          <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground">
            <ArrowUpDown className="h-4 w-4 shrink-0" aria-hidden />
            <span className="text-xs font-medium">Sort by</span>
            <select
              value={sortOption}
              onChange={(event) => {
                setSortOption(event.target.value as SortOption);
                setPage(1);
              }}
              aria-label="Sort survey results"
              className="min-w-0 bg-transparent font-medium text-foreground outline-none"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
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
              onClick={() => {
                setCommentFilter(id);
                setPage(1);
              }}
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
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">Submitted</th>
                  <th className="px-3 py-3 font-semibold">Appointment</th>
                  <th className="px-3 py-3 font-semibold">Visit type</th>
                  <th className="px-3 py-3 font-semibold">Patient</th>
                  <th className="px-3 py-3 font-semibold">Handling</th>
                  <th className="px-3 py-3 font-semibold">Scheduling</th>
                  <th className="px-3 py-3 font-semibold">Visit rating</th>
                  <th className="px-3 py-3 font-semibold">Wait time</th>
                  <th className="px-3 py-3 font-semibold">Provider(s)</th>
                  <th className="px-3 py-3 font-semibold">Recommend</th>
                  <th className="px-3 py-3 font-semibold">Customer answers</th>
                  <th className="px-5 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {pageReviews.map((review) => {
                  const writtenResponses = getAppointmentReviewWrittenResponses(review);
                  const management = review.feedbackManagement;
                  const managementStatus = management?.status ?? "needs_review";
                  return (
                    <tr
                      key={review.id}
                      className="cursor-pointer border-b border-border/70 transition hover:bg-surface-muted/30"
                      onClick={() => onViewReview(review.id)}
                    >
                      <td className="px-5 py-3 text-foreground">{formatReviewWhen(review.createdAt)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-foreground">
                        {formatAppointmentDate(review.appointmentDate)}
                      </td>
                      <td className="max-w-[180px] px-3 py-3 text-foreground">
                        <p className="line-clamp-2">
                          {review.appointmentVisitTypes.join(", ") || "—"}
                        </p>
                      </td>
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
                      <td className="max-w-[180px] px-3 py-3">
                        <span
                          className={
                            "inline-flex rounded-full px-2 py-1 text-[11px] font-semibold " +
                            (managementStatus === "actioned"
                              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                              : managementStatus === "in_progress"
                                ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
                                : managementStatus === "no_action_needed"
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-accent/10 text-accent")
                          }
                        >
                          {appointmentReviewActionStatusLabel(managementStatus)}
                        </span>
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {management?.responsiblePerson || "Unassigned"}
                        </p>
                      </td>
                      <td className="px-3 py-3 font-mono text-foreground">
                        {formatRating(review.appointmentEase)}
                      </td>
                      <td className="px-3 py-3 font-mono text-foreground">
                        {formatRating(review.visitRating)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{review.waitTimeLabel}</td>
                      <td className="max-w-[220px] px-3 py-3">
                        <p className="line-clamp-2 text-foreground">{review.serviceTypeLabel || "—"}</p>
                      </td>
                      <td className="px-3 py-3 font-mono text-foreground">
                        {formatRating(review.recommendationRating)}
                      </td>
                      <td className="max-w-[280px] px-3 py-3">
                        {writtenResponses.length > 0 ? (
                          <div className="space-y-1.5">
                            {writtenResponses.slice(0, 2).map((answer) => (
                              <div key={answer.id} className="flex items-start gap-2">
                                <MessageSquareText
                                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent"
                                  aria-hidden
                                />
                                <p className="line-clamp-1 text-xs text-foreground" title={answer.text}>
                                  <span className="font-semibold">{answer.label}:</span> {answer.text}
                                </p>
                              </div>
                            ))}
                            {writtenResponses.length > 2 ? (
                              <p className="pl-5 text-[11px] text-muted-foreground">
                                +{writtenResponses.length - 2} more written answer
                                {writtenResponses.length === 3 ? "" : "s"}
                              </p>
                            ) : null}
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
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-muted-foreground">
              Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length} result{filtered.length === 1 ? "" : "s"} · Page {currentPage} of{" "}
              {pageCount}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-medium text-foreground transition hover:bg-surface-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage === pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-medium text-foreground transition hover:bg-surface-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
