"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AppointmentReviewStats } from "@/lib/appointment-review/analytics";
import type { AppointmentReviewDetail } from "@/lib/appointment-review/display";
import { appointmentReviewActionStatusLabel } from "@/lib/appointment-review/management";
import { APPOINTMENT_REVIEW_MAX_SCORE } from "@/lib/appointment-review/types";
import type { DailyCheckoutPoint } from "@/lib/survey-outreach/checkout-stats";
import type { DailyInitialSurveySendPoint } from "@/lib/survey-outreach/sent-stats";
import { SummaryCards } from "@/components/dashboard/summary-cards";

const CHART_COLORS = [
  "var(--chart-this-year)",
  "var(--chart-target)",
  "var(--accent-2)",
];

const YES_NO_COLORS = ["var(--chart-this-year)", "#64748b"];
const PATIENT_RESPONSE_PAGE_SIZE = 8;
type PatientResponseTab = "testimonial" | "exceptional-staff";

const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--foreground)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
  },
  labelStyle: { color: "var(--foreground)", fontWeight: 600 },
  itemStyle: { color: "var(--foreground)" },
} as const;

function ChartCard({ title, subtitle, children, tall }: { title: string; subtitle?: string; children: React.ReactNode; tall?: boolean }) {
  return (
    <div className={`dashboard-card flex w-full min-w-0 flex-col p-4 sm:p-5 ${tall ? "h-[340px]" : "h-[300px]"}`}>
      <span className="dashboard-card-accent" aria-hidden />
      <div className="mb-3 shrink-0 pt-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function ChartViewport({
  children,
  minWidth = "34rem",
}: {
  children: React.ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="-mx-2 h-full overflow-x-auto overflow-y-hidden px-2 pb-1">
      <div className="h-full min-w-full" style={{ minWidth }}>
        {children}
      </div>
    </div>
  );
}

function shortRatingMetric(metric: string): string {
  const lower = metric.toLowerCase();
  if (lower.includes("scheduling")) return "Scheduling";
  if (lower.includes("overall")) return "Visit";
  if (lower.includes("provider")) return "Provider";
  if (lower.includes("health")) return "Health";
  if (lower.includes("recommend")) return "Recommend";
  if (lower.includes("front")) return "Front desk";
  return metric;
}

function formatDay(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso + "T12:00:00"));
  } catch {
    return iso;
  }
}

function mergeDailyPatientVolume(
  checkouts: readonly DailyCheckoutPoint[],
  surveySends: readonly DailyInitialSurveySendPoint[],
) {
  const points = new Map<
    string,
    { date: string; checkouts: number; surveysSent: number }
  >();

  for (const point of checkouts) {
    points.set(point.date, { date: point.date, checkouts: point.count, surveysSent: 0 });
  }
  for (const point of surveySends) {
    const current = points.get(point.date) ?? {
      date: point.date,
      checkouts: 0,
      surveysSent: 0,
    };
    current.surveysSent = point.count;
    points.set(point.date, current);
  }

  return Array.from(points.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function YesNoPie({ title, data }: { title: string; data: AppointmentReviewStats["providerTimeAdequate"] }) {
  const chartData = data.filter((d) => d.count > 0);
  return (
    <ChartCard title={title} subtitle="Share of responses">
      {chartData.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="count" nameKey="label" innerRadius={44} outerRadius={72} paddingAngle={2}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={YES_NO_COLORS[i % YES_NO_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value, _name, item) => {
                const pct = (item.payload as { pct?: number }).pct;
                return [`${value} (${pct ?? 0}%)`, String(item.payload.label)];
              }}
            />
            <Legend wrapperStyle={{ color: "var(--foreground)", fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

type Props = {
  stats: AppointmentReviewStats;
  reviews: AppointmentReviewDetail[];
  numberCheckouts: number;
  numberMultipleSameDayAppointments: number | null;
  numberSent: number;
  numberBouncedInitialSends: number;
  numberPermanentInitialFailures: number;
  numberNoEmail: number | null;
  periodLabel: string;
  refreshing: boolean;
  dailyCheckouts: DailyCheckoutPoint[];
  dailySurveySends: DailyInitialSurveySendPoint[];
  onViewReview?: (id: string) => void;
};

export function AppointmentReviewDashboard({
  stats,
  reviews,
  numberCheckouts,
  numberMultipleSameDayAppointments,
  numberSent,
  numberBouncedInitialSends,
  numberPermanentInitialFailures,
  numberNoEmail,
  periodLabel,
  refreshing,
  dailyCheckouts,
  dailySurveySends,
  onViewReview,
}: Props) {
  const [patientResponseTab, setPatientResponseTab] =
    useState<PatientResponseTab>("testimonial");
  const [patientResponsePage, setPatientResponsePage] = useState(1);
  const empty = stats.total === 0;
  const ratingScores = stats.ratingScores.map((score) => ({
    ...score,
    shortMetric: shortRatingMetric(score.metric),
  }));
  const dailyPatientVolume = mergeDailyPatientVolume(dailyCheckouts, dailySurveySends);
  const testimonialResponses = reviews
    .filter((review) => !review.isTest && review.testimonialText.trim().length > 0)
    .map((review) => ({ review, text: review.testimonialText.trim() }))
    .sort((a, b) => b.review.createdAt.localeCompare(a.review.createdAt));
  const exceptionalStaffResponses = reviews
    .filter((review) => !review.isTest && review.exceptionalStaffComment.trim().length > 0)
    .map((review) => ({ review, text: review.exceptionalStaffComment.trim() }))
    .sort((a, b) => b.review.createdAt.localeCompare(a.review.createdAt));
  const patientResponses =
    patientResponseTab === "testimonial"
      ? testimonialResponses
      : exceptionalStaffResponses;
  const patientResponsePageCount = Math.max(
    1,
    Math.ceil(patientResponses.length / PATIENT_RESPONSE_PAGE_SIZE),
  );
  const currentPatientResponsePage = Math.min(
    patientResponsePage,
    patientResponsePageCount,
  );
  const patientResponseStart =
    (currentPatientResponsePage - 1) * PATIENT_RESPONSE_PAGE_SIZE;
  const visiblePatientResponses = patientResponses.slice(
    patientResponseStart,
    patientResponseStart + PATIENT_RESPONSE_PAGE_SIZE,
  );

  return (
    <div className="space-y-6">
      <div className="flex min-h-6 items-center justify-between gap-3" aria-live="polite">
        <p className="min-w-0 text-sm text-muted-foreground">
          KPIs for <span className="font-semibold text-foreground">{periodLabel}</span>
        </p>
        {refreshing ? (
          <span className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Updating
          </span>
        ) : null}
      </div>
      <div className={refreshing ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={refreshing}>
        <SummaryCards
          cards={[
          {
            label: "Initial surveys sent",
            value: String(numberSent),
            hint: "Counted by checkout date; repeat visits included, failures and reminders excluded",
          },
          {
            label: "Total responses",
            value: String(stats.total),
            hint: "Provider experience survey submissions",
          },
          {
            label: "Check-outs",
            value: String(numberCheckouts),
            hint: "Checked-out appointments since the survey launched, within the selected range",
          },
          {
            label: "Multiple same-day appointments",
            value:
              numberMultipleSameDayAppointments === null
                ? "—"
                : String(numberMultipleSameDayAppointments),
            hint: "Additional check-outs since launch when a patient had multiple appointments that day",
          },
          {
            label: "Bounced emails",
            value: String(numberBouncedInitialSends),
            hint: "Initial messages later reported as undeliverable by Outlook",
          },
          ...(numberPermanentInitialFailures > 0
            ? [{
                label: "Failed before send",
                value: String(numberPermanentInitialFailures),
                hint: "Initial messages rejected before the mail provider accepted them",
              }]
            : []),
          {
            label: "No email",
            value: numberNoEmail === null ? "—" : String(numberNoEmail),
            hint: "Checked-out patient-day groups with no email in the CRM",
          },
          {
            label: "Avg. scheduling ease",
            value: empty ? "—" : `${stats.averages.appointmentEase}/${APPOINTMENT_REVIEW_MAX_SCORE}`,
            hint: "Ease of scheduling an appointment",
          },
          {
            label: "Avg. visit rating",
            value: empty ? "—" : `${stats.averages.visitRating}/${APPOINTMENT_REVIEW_MAX_SCORE}`,
            hint: "Overall visit with the practice",
          },
          {
            label: "Avg. provider rating",
            value: empty || !stats.averages.providerRating ? "—" : `${stats.averages.providerRating}/${APPOINTMENT_REVIEW_MAX_SCORE}`,
            hint: "Rating of care from the provider(s) selected",
          },
          {
            label: "Avg. recommend score",
            value: empty || !stats.averages.recommendationRating ? "—" : `${stats.averages.recommendationRating}/${APPOINTMENT_REVIEW_MAX_SCORE}`,
            hint: "Likelihood to recommend NMAC",
          },
          ]}
        />
      </div>

      <ChartCard
        title="Patient check-outs and surveys sent per day"
        subtitle="Successful initial surveys are grouped by the patient's checkout date"
        tall
      >
        {dailyPatientVolume.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">No checkout data is available for this period.</p>
          </div>
        ) : (
          <ChartViewport minWidth="34rem">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyPatientVolume} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDay}
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  stroke="var(--border)"
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  domain={[0, "auto"]}
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  stroke="var(--border)"
                  width={36}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  labelFormatter={(label) => formatDay(String(label ?? ""))}
                  formatter={(value, name) => [Number(value).toLocaleString(), String(name)]}
                />
                <Legend wrapperStyle={{ color: "var(--foreground)", fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="checkouts"
                  name="Check-outs"
                  stroke="var(--chart-this-year)"
                  strokeWidth={2.5}
                  dot={dailyPatientVolume.length <= 31 ? { r: 3 } : false}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="surveysSent"
                  name="Initial surveys sent"
                  stroke="var(--chart-target)"
                  strokeWidth={2.5}
                  dot={dailyPatientVolume.length <= 31 ? { r: 3 } : false}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartViewport>
        )}
      </ChartCard>

      {empty ? (
        <div className="dashboard-card p-6">
          <span className="dashboard-card-accent" aria-hidden />
          <p className="text-sm font-medium text-foreground">No responses yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Share the public form at <span className="font-mono text-foreground">/appointment-review</span> with
            patients after their visit. Results will appear here automatically.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Average ratings" subtitle={`Scale 1 (worst) to ${APPOINTMENT_REVIEW_MAX_SCORE} (best)`} tall>
              <ChartViewport minWidth="38rem">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ratingScores} margin={{ top: 20, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis
                      dataKey="shortMetric"
                      tick={{ fontSize: 11, fill: "var(--foreground)" }}
                      stroke="var(--border)"
                      interval={0}
                      height={32}
                    />
                    <YAxis
                      domain={[0, APPOINTMENT_REVIEW_MAX_SCORE]}
                      tick={{ fontSize: 11, fill: "var(--muted)" }}
                      stroke="var(--border)"
                      width={28}
                    />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      labelFormatter={(label) =>
                        ratingScores.find((score) => score.shortMetric === label)?.metric ?? String(label)
                      }
                      formatter={(value) => [`${value}/${APPOINTMENT_REVIEW_MAX_SCORE}`, "Average"]}
                    />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {ratingScores.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                      <LabelList
                        dataKey="score"
                        position="top"
                        formatter={(v) => `${v}/${APPOINTMENT_REVIEW_MAX_SCORE}`}
                        fill="var(--foreground)"
                        fontSize={12}
                        fontWeight={600}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartViewport>
            </ChartCard>

            <ChartCard title="Scheduling & visit trend" subtitle="Daily averages when multiple responses exist" tall>
              <ChartViewport minWidth="34rem">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.ratingTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDay}
                      tick={{ fontSize: 11, fill: "var(--muted)" }}
                      stroke="var(--border)"
                    />
                    <YAxis
                      domain={[0, APPOINTMENT_REVIEW_MAX_SCORE]}
                      tick={{ fontSize: 11, fill: "var(--muted)" }}
                      stroke="var(--border)"
                      width={28}
                    />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      labelFormatter={(label) => formatDay(String(label ?? ""))}
                      formatter={(value, name) => [`${value}/${APPOINTMENT_REVIEW_MAX_SCORE}`, String(name)]}
                    />
                    <Legend wrapperStyle={{ color: "var(--foreground)", fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="ease"
                      name="Scheduling ease"
                      stroke="var(--chart-this-year)"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="visit"
                      name="Visit rating"
                      stroke="var(--chart-target)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartViewport>
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Wait time before exam room">
              <ChartViewport minWidth="32rem">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.waitTime} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--foreground)" }} stroke="var(--border)" interval={0} angle={-12} textAnchor="end" height={52} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--border)" width={28} />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(value, _name, item) => {
                        const pct = (item.payload as { pct?: number }).pct;
                        return [`${value} (${pct ?? 0}%)`, "Responses"];
                      }}
                    />
                    <Bar dataKey="count" fill="var(--chart-this-year)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartViewport>
            </ChartCard>

            <ChartCard title="Patient tenure">
              <ChartViewport minWidth="32rem">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.patientDuration} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--foreground)" }} stroke="var(--border)" interval={0} angle={-12} textAnchor="end" height={52} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--border)" width={28} />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(value, _name, item) => {
                        const pct = (item.payload as { pct?: number }).pct;
                        return [`${value} (${pct ?? 0}%)`, "Responses"];
                      }}
                    />
                    <Bar dataKey="count" fill="var(--accent-2)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartViewport>
            </ChartCard>
          </div>

          <YesNoPie title="Provider(s) spent enough time" data={stats.providerTimeAdequate} />

          {stats.serviceTypes.length > 0 ? (
            <ChartCard title="Providers seen">
              <ChartViewport minWidth="36rem">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.serviceTypes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--foreground)" }} stroke="var(--border)" interval={0} angle={-12} textAnchor="end" height={52} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--border)" width={28} />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(value, _name, item) => {
                        const pct = (item.payload as { pct?: number }).pct;
                        return [`${value} (${pct ?? 0}%)`, "Responses"];
                      }}
                    />
                    <Bar dataKey="count" fill="var(--chart-this-year)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartViewport>
            </ChartCard>
          ) : null}

          {stats.referralSources.length > 0 ? (
            <ChartCard title="How new patients heard about NMAC" subtitle="New patients only; check-all-that-apply">
              <ChartViewport minWidth="36rem">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.referralSources} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--foreground)" }} stroke="var(--border)" interval={0} angle={-12} textAnchor="end" height={52} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--border)" width={28} />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(value, _name, item) => {
                        const pct = (item.payload as { pct?: number }).pct;
                        return [`${value} (${pct ?? 0}%)`, "New patients"];
                      }}
                    />
                    <Bar dataKey="count" fill="var(--chart-target)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartViewport>
            </ChartCard>
          ) : null}

          {testimonialResponses.length > 0 || exceptionalStaffResponses.length > 0 ? (
            <div className="dashboard-card overflow-hidden">
              <span className="dashboard-card-accent" aria-hidden />
              <div className="p-4 pb-0 sm:p-5 sm:pb-0">
                <p className="text-sm font-semibold text-foreground">Recent patient responses</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {onViewReview
                    ? "Select any highlighted row to open the full review"
                    : "Written responses from the survey"}
                </p>
                <div
                  className="mt-4 inline-flex rounded-xl border border-border bg-surface-muted/35 p-1"
                  role="tablist"
                  aria-label="Patient response type"
                >
                  {([
                    ["testimonial", "Testimonials", testimonialResponses.length],
                    ["exceptional-staff", "Exceptional staff", exceptionalStaffResponses.length],
                  ] as const).map(([id, label, count]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={patientResponseTab === id}
                      onClick={() => {
                        setPatientResponseTab(id);
                        setPatientResponsePage(1);
                      }}
                      className={
                        "rounded-lg px-3 py-2 text-sm font-semibold transition " +
                        (patientResponseTab === id
                          ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                          : "text-muted-foreground hover:text-foreground")
                      }
                    >
                      {label}
                      <span className="ml-2 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 overflow-x-auto border-y border-border">
                <table className="w-full min-w-[820px] table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[18%]" />
                    <col className="w-[18%]" />
                    <col className="w-[14%]" />
                    <col className="w-[13%]" />
                    <col className="w-[37%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-surface-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-3 font-semibold">Patient name</th>
                      <th className="px-4 py-3 font-semibold">Visit type</th>
                      <th className="px-4 py-3 font-semibold">Handler</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">
                        {patientResponseTab === "testimonial" ? "Testimonial" : "Exceptional staff"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePatientResponses.length > 0 ? (
                      visiblePatientResponses.map(({ review, text }) => {
                        const management = review.feedbackManagement;
                        const status = management?.status ?? "needs_review";
                        const visitType = review.appointmentVisitTypes.join(", ") || "—";
                        return (
                          <tr
                            key={`${review.id}-${patientResponseTab}`}
                            tabIndex={onViewReview ? 0 : undefined}
                            onClick={() => onViewReview?.(review.id)}
                            onKeyDown={(event) => {
                              if (!onViewReview || (event.key !== "Enter" && event.key !== " ")) return;
                              event.preventDefault();
                              onViewReview(review.id);
                            }}
                            className={
                              "group border-t border-border/70 align-top transition-colors " +
                              (onViewReview
                                ? "cursor-pointer hover:bg-accent/10 focus-visible:bg-accent/10 focus-visible:outline-none"
                                : "")
                            }
                            aria-label={onViewReview ? `Open review for ${review.patientName}` : undefined}
                          >
                            <td className="px-5 py-4 font-semibold text-foreground">
                              <p className="line-clamp-2 leading-snug">{review.patientName}</p>
                            </td>
                            <td className="px-4 py-4 text-foreground">
                              <p className="line-clamp-2 leading-snug" title={visitType}>{visitType}</p>
                            </td>
                            <td className="px-4 py-4 text-foreground">
                              <p className="line-clamp-2 leading-snug">
                                {management?.responsiblePerson || "Unassigned"}
                              </p>
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={
                                  "inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold leading-tight " +
                                  (status === "actioned"
                                    ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                                    : status === "in_progress"
                                      ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
                                      : status === "no_action_needed"
                                        ? "bg-muted text-muted-foreground"
                                        : "bg-accent/10 text-accent")
                                }
                              >
                                {appointmentReviewActionStatusLabel(status)}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-foreground">
                              <div className="flex items-start justify-between gap-3">
                                <p className="line-clamp-3 min-w-0 leading-relaxed" title={text}>{text}</p>
                                {onViewReview ? (
                                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent transition group-hover:border-accent group-hover:bg-accent/20">
                                    Open review
                                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                                  </span>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                          No {patientResponseTab === "testimonial" ? "testimonials" : "exceptional staff responses"} in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-muted-foreground">
                  {patientResponses.length > 0 ? (
                    <>
                      Showing {patientResponseStart + 1}–
                      {Math.min(
                        patientResponseStart + PATIENT_RESPONSE_PAGE_SIZE,
                        patientResponses.length,
                      )}{" "}
                      of {patientResponses.length} response
                      {patientResponses.length === 1 ? "" : "s"} · Page{" "}
                      {currentPatientResponsePage} of {patientResponsePageCount}
                    </>
                  ) : "No responses to display"}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={currentPatientResponsePage === 1}
                    onClick={() => setPatientResponsePage((page) => Math.max(1, page - 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-medium text-foreground transition hover:bg-surface-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={currentPatientResponsePage === patientResponsePageCount}
                    onClick={() =>
                      setPatientResponsePage((page) =>
                        Math.min(patientResponsePageCount, page + 1),
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-medium text-foreground transition hover:bg-surface-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
