"use client";

import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  ListFilter,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { SheetData } from "write-excel-file/browser";
import type { AppointmentReviewDetail } from "@/lib/appointment-review/display";
import {
  APPOINTMENT_REVIEW_ACTION_STATUS_OPTIONS,
  appointmentReviewActionStatusLabel,
} from "@/lib/appointment-review/management";
import {
  APPOINTMENT_REVIEW_RATING_MAX,
  APPOINTMENT_REVIEW_RATING_MIN,
  countActiveAppointmentReviewFilters,
  DEFAULT_APPOINTMENT_REVIEW_FILTERS,
  filterAppointmentReviews,
  getAppointmentReviewAverageRating,
  getAppointmentReviewFilterOptions,
  getAppointmentReviewHandler,
  getAppointmentReviewProviderNames,
  type AppointmentReviewFilters,
} from "@/lib/appointment-review/filters";
import {
  formatAppointmentDate,
  formatAppointmentTime,
  formatRating,
  formatReviewWhen,
  formatYesNoOrDash,
} from "@/lib/appointment-review/display";

type Props = {
  reviews: AppointmentReviewDetail[];
  onViewReview: (id: string) => void;
  periodLabel?: string;
  title?: string;
  resultLabel?: string;
  emptyMessage?: string;
  showTestResponses: boolean;
  showTestControl?: boolean;
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
type ExportFormat = "excel" | "pdf";

const PAGE_SIZE = 10;

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "appointment-desc", label: "Appointment: newest" },
  { value: "appointment-asc", label: "Appointment: oldest" },
  { value: "name-asc", label: "Patient name: A–Z" },
  { value: "name-desc", label: "Patient name: Z–A" },
  { value: "submitted-desc", label: "Submitted: newest" },
  { value: "submitted-asc", label: "Submitted: oldest" },
];

function formatTableSubmittedAt(value: string): { date: string; time: string } {
  try {
    const date = new Date(value);
    return {
      date: new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date),
      time: new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(date),
    };
  } catch {
    return { date: value, time: "" };
  }
}

function formatAverageReviewRating(review: AppointmentReviewDetail): string {
  const averageRating = getAppointmentReviewAverageRating(review);
  return averageRating === null ? "—" : `${averageRating.toFixed(1)}/5`;
}

function ReviewFilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0 text-xs font-medium text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-10 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

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

function describeExportFilters(
  filters: AppointmentReviewFilters,
  commentFilter: CommentFilter,
): string[] {
  const descriptions: string[] = [];
  if (filters.patientName) descriptions.push(`Patient: ${filters.patientName}`);
  if (filters.visitType) descriptions.push(`Visit type: ${filters.visitType}`);
  if (filters.handler) descriptions.push(`Handler: ${filters.handler}`);
  if (filters.provider) descriptions.push(`Provider: ${filters.provider}`);
  if (
    filters.ratingMin !== APPOINTMENT_REVIEW_RATING_MIN ||
    filters.ratingMax !== APPOINTMENT_REVIEW_RATING_MAX
  ) {
    descriptions.push(`Average rating: ${filters.ratingMin.toFixed(1)}-${filters.ratingMax.toFixed(1)}`);
  }
  if (filters.resolution) {
    descriptions.push(`Handling resolution: ${appointmentReviewActionStatusLabel(filters.resolution)}`);
  }
  if (commentFilter === "with-comments") descriptions.push("Written responses only");
  return descriptions;
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
  title = "Survey results",
  resultLabel,
  emptyMessage,
  showTestResponses,
  showTestControl = true,
  testResponsesLoading = false,
  onShowTestResponsesChange,
}: Props) {
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("submitted-desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<AppointmentReviewFilters>(
    DEFAULT_APPOINTMENT_REVIEW_FILTERS,
  );
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const filterOptions = useMemo(
    () => getAppointmentReviewFilterOptions(reviews),
    [reviews],
  );
  const activeFilterCount = countActiveAppointmentReviewFilters(filters);
  const filtered = useMemo(() => {
    const commentMatches = commentFilter === "with-comments"
      ? reviews.filter((review) => review.hasComments)
      : reviews;
    const included = filterAppointmentReviews(commentMatches, filters);
    return [...included].sort((first, second) => compareReviews(first, second, sortOption));
  }, [commentFilter, filters, reviews, sortOption]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageReviews = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const liveCount = filtered.filter((review) => !review.isTest).length;
  const testCount = filtered.length - liveCount;
  const exportFilters = describeExportFilters(filters, commentFilter);
  const selectedSortLabel = SORT_OPTIONS.find((option) => option.value === sortOption)?.label
    ?? "Submitted: newest";

  const runExport = async (format: ExportFormat) => {
    setExporting(format);
    setExportError(null);
    try {
      if (format === "excel") {
        await downloadSurveyAnswers(filtered, periodLabel);
        return;
      }
      const { downloadAppointmentReviewPdf } = await import(
        "@/lib/appointment-review/pdf-report"
      );
      await downloadAppointmentReviewPdf({
        reviews: filtered,
        periodLabel,
        reportTitle: title === "My assigned reviews"
          ? "My Assigned Survey Reviews"
          : "Provider Experience Survey Report",
        filterSummary: exportFilters,
        sortLabel: selectedSortLabel,
      });
    } catch {
      setExportError(
        format === "pdf"
          ? "The PDF report could not be created. Please try again."
          : "The Excel workbook could not be created. Please try again.",
      );
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="dashboard-card overflow-hidden">
      <span className="dashboard-card-accent" aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {periodLabel} · {resultLabel
              ? `${filtered.length} ${resultLabel}${filtered.length === 1 ? "" : "s"}`
              : `${liveCount} live review${liveCount === 1 ? "" : "s"}`}
            {!resultLabel && showTestResponses
              ? ` · ${testCount} test response${testCount === 1 ? "" : "s"} shown`
              : ""}
            {commentFilter === "with-comments" ? " with written responses" : ""}
            {activeFilterCount > 0
              ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} applied`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={filtered.length === 0 || exporting !== null}
            onClick={() => void runExport("excel")}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:bg-surface-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
            title="Download all matching survey answers as an Excel workbook"
          >
            {exporting === "excel" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
            )}
            {exporting === "excel" ? "Preparing Excel" : "Export Excel"}
          </button>
          <button
            type="button"
            disabled={filtered.length === 0 || exporting !== null}
            onClick={() => void runExport("pdf")}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:bg-surface-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
            title="Download all matching survey answers as a formatted PDF report"
          >
            {exporting === "pdf" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileText className="h-4 w-4" aria-hidden />
            )}
            {exporting === "pdf" ? "Preparing PDF" : "Export PDF"}
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
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="appointment-review-filters"
            onClick={() => setFiltersOpen((open) => !open)}
            className={
              "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition "
              + (filtersOpen || activeFilterCount > 0
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-card text-foreground hover:bg-surface-muted/80")
            }
          >
            <ListFilter className="h-4 w-4 shrink-0" aria-hidden />
            Filter
            {activeFilterCount > 0 ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground">
                {activeFilterCount}
              </span>
            ) : null}
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {showTestControl ? (
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
          ) : null}
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

      {exportError ? (
        <div
          className="flex items-center justify-between gap-3 border-b border-red-500/25 bg-red-500/8 px-4 py-2.5 text-sm text-red-700 dark:text-red-300 sm:px-5"
          role="alert"
        >
          <span>{exportError}</span>
          <button
            type="button"
            onClick={() => setExportError(null)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-current transition hover:bg-red-500/10"
            aria-label="Dismiss export error"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {filtersOpen ? (
        <div
          id="appointment-review-filters"
          className="border-b border-border bg-surface-muted/20 px-4 py-4 sm:px-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Filter results</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Choose any combination. Results update immediately.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={activeFilterCount === 0}
                onClick={() => {
                  setFilters(DEFAULT_APPOINTMENT_REVIEW_FILTERS);
                  setPage(1);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground transition hover:bg-surface-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-surface-muted/80 hover:text-foreground"
                aria-label="Close filters"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <ReviewFilterSelect
              label="Patient name"
              allLabel="All patients"
              value={filters.patientName}
              options={filterOptions.patientNames}
              onChange={(patientName) => {
                setFilters((current) => ({ ...current, patientName }));
                setPage(1);
              }}
            />
            <ReviewFilterSelect
              label="Visit type"
              allLabel="All visit types"
              value={filters.visitType}
              options={filterOptions.visitTypes}
              onChange={(visitType) => {
                setFilters((current) => ({ ...current, visitType }));
                setPage(1);
              }}
            />
            <ReviewFilterSelect
              label="Handler"
              allLabel="All handlers"
              value={filters.handler}
              options={filterOptions.handlers}
              onChange={(handler) => {
                setFilters((current) => ({ ...current, handler }));
                setPage(1);
              }}
            />
            <ReviewFilterSelect
              label="Provider"
              allLabel="All providers"
              value={filters.provider}
              options={filterOptions.providers}
              onChange={(provider) => {
                setFilters((current) => ({ ...current, provider }));
                setPage(1);
              }}
            />
            <label className="min-w-0 text-xs font-medium text-muted-foreground">
              Handling resolution
              <select
                value={filters.resolution}
                onChange={(event) => {
                  setFilters((current) => ({
                    ...current,
                    resolution: event.target.value as AppointmentReviewFilters["resolution"],
                  }));
                  setPage(1);
                }}
                className="mt-1.5 h-10 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              >
                <option value="">All resolutions</option>
                {APPOINTMENT_REVIEW_ACTION_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <div
              role="group"
              aria-labelledby="appointment-review-rating-filter-label"
              className="min-w-0 rounded-lg border border-border bg-card px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  id="appointment-review-rating-filter-label"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Average rating
                </p>
                <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                  {filters.ratingMin.toFixed(1)}–{filters.ratingMax.toFixed(1)}
                </span>
              </div>
              <div className="relative mt-3 h-5" aria-label="Average rating range">
                <div className="absolute left-0 right-0 top-2 h-1 rounded-full bg-muted-foreground/20" />
                <div
                  className="absolute top-2 h-1 rounded-full bg-accent"
                  style={{
                    left: `${((filters.ratingMin - APPOINTMENT_REVIEW_RATING_MIN) / (APPOINTMENT_REVIEW_RATING_MAX - APPOINTMENT_REVIEW_RATING_MIN)) * 100}%`,
                    right: `${100 - ((filters.ratingMax - APPOINTMENT_REVIEW_RATING_MIN) / (APPOINTMENT_REVIEW_RATING_MAX - APPOINTMENT_REVIEW_RATING_MIN)) * 100}%`,
                  }}
                />
                <input
                  type="range"
                  min={APPOINTMENT_REVIEW_RATING_MIN}
                  max={APPOINTMENT_REVIEW_RATING_MAX}
                  step="0.1"
                  value={filters.ratingMin}
                  aria-label="Minimum average rating"
                  onChange={(event) => {
                    const ratingMin = Math.min(Number(event.target.value), filters.ratingMax);
                    setFilters((current) => ({ ...current, ratingMin }));
                    setPage(1);
                  }}
                  className="appointment-review-rating-range absolute inset-x-0 top-0 z-20 w-full"
                />
                <input
                  type="range"
                  min={APPOINTMENT_REVIEW_RATING_MIN}
                  max={APPOINTMENT_REVIEW_RATING_MAX}
                  step="0.1"
                  value={filters.ratingMax}
                  aria-label="Maximum average rating"
                  onChange={(event) => {
                    const ratingMax = Math.max(Number(event.target.value), filters.ratingMin);
                    setFilters((current) => ({ ...current, ratingMax }));
                    setPage(1);
                  }}
                  className="appointment-review-rating-range absolute inset-x-0 top-0 z-30 w-full"
                />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>1.0</span>
                <span>5.0</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted-foreground">
          {activeFilterCount > 0
            ? "No reviews match the selected filters."
            : emptyMessage && commentFilter === "all"
            ? emptyMessage
            : commentFilter === "with-comments"
            ? "No reviews with written responses in this period."
            : "No reviews in this period."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[12%]" />
                <col className="w-[13%]" />
                <col className="w-[16%]" />
                <col className="w-[15%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-surface-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">Time submitted</th>
                  <th className="px-4 py-3 font-semibold">Appointment time</th>
                  <th className="px-4 py-3 font-semibold">Patient name</th>
                  <th className="px-4 py-3 font-semibold">Visit type</th>
                  <th className="px-4 py-3 font-semibold">Handler</th>
                  <th className="px-4 py-3 font-semibold">Provider</th>
                  <th className="px-3 py-3 font-semibold">Average rating</th>
                  <th className="px-3 py-3 font-semibold">Handling resolution</th>
                </tr>
              </thead>
              <tbody>
                {pageReviews.map((review) => {
                  const management = review.feedbackManagement;
                  const submittedAt = formatTableSubmittedAt(review.createdAt);
                  const providerNames = getAppointmentReviewProviderNames(review).join(", ") || "—";
                  const averageRating = formatAverageReviewRating(review);
                  const resolution = appointmentReviewActionStatusLabel(
                    management?.status ?? "needs_review",
                  );
                  return (
                    <tr
                      key={review.id}
                      className="cursor-pointer border-b border-border/70 align-top transition hover:bg-surface-muted/30"
                      onClick={() => onViewReview(review.id)}
                      title={`Open review for ${review.patientName}`}
                    >
                      <td className="px-5 py-3.5 text-foreground">
                        <p className="text-xs font-medium leading-snug">{submittedAt.date}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{submittedAt.time}</p>
                      </td>
                      <td className="px-4 py-3.5 text-foreground">
                        <p className="text-xs font-medium leading-snug">
                          {formatAppointmentDate(review.appointmentDate)}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {formatAppointmentTime(review.appointmentAt)}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="line-clamp-2 font-semibold leading-snug text-foreground">
                            {review.patientName}
                          </p>
                          {review.isTest ? (
                            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                              Test
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-foreground">
                        <p
                          className="line-clamp-2 leading-snug"
                          title={review.appointmentVisitTypes.join(", ")}
                        >
                          {review.appointmentVisitTypes.join(", ") || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-foreground">
                        <p className="line-clamp-2 leading-snug">
                          {getAppointmentReviewHandler(review)}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-foreground">
                        <p className="line-clamp-2 leading-snug" title={providerNames}>
                          {providerNames}
                        </p>
                      </td>
                      <td className="px-3 py-3.5 text-foreground">
                        <p className="font-mono font-semibold tabular-nums">{averageRating}</p>
                      </td>
                      <td className="px-3 py-3.5">
                        <span
                          className={
                            "inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold leading-tight " +
                            (management?.status === "actioned"
                              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                              : management?.status === "in_progress"
                                ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
                                : management?.status === "no_action_needed"
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-accent/10 text-accent")
                          }
                        >
                          {resolution}
                        </span>
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
