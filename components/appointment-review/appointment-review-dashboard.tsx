"use client";

import { Loader2 } from "lucide-react";
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
import { APPOINTMENT_REVIEW_MAX_SCORE } from "@/lib/appointment-review/types";
import type { DailyCheckoutPoint } from "@/lib/survey-outreach/checkout-stats";
import { SummaryCards } from "@/components/dashboard/summary-cards";

const CHART_COLORS = [
  "var(--chart-this-year)",
  "var(--chart-target)",
  "var(--accent-2)",
];

const YES_NO_COLORS = ["var(--chart-this-year)", "#64748b"];

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

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
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
  numberSent: number;
  numberRepeatInitialSends: number;
  numberFailedInitialSends: number;
  periodLabel: string;
  refreshing: boolean;
  dailyCheckouts: DailyCheckoutPoint[];
  onViewReview?: (id: string) => void;
};

export function AppointmentReviewDashboard({
  stats,
  numberSent,
  numberRepeatInitialSends,
  numberFailedInitialSends,
  periodLabel,
  refreshing,
  dailyCheckouts,
  onViewReview,
}: Props) {
  const empty = stats.total === 0;
  const ratingScores = stats.ratingScores.map((score) => ({
    ...score,
    shortMetric: shortRatingMetric(score.metric),
  }));

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
            label: "Repeat initial sends",
            value: String(numberRepeatInitialSends),
            hint: "Additional successful sends to an address already counted in this period",
          },
          {
            label: "Failed initial sends",
            value: String(numberFailedInitialSends),
            hint: "Initial survey attempts in this period with a known delivery failure",
          },
          {
            label: "Total responses",
            value: String(stats.total),
            hint: "Provider experience survey submissions",
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

      <ChartCard title="Patient check-outs per day" subtitle="Daily checked-out appointments from the CRM" tall>
        {dailyCheckouts.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">No checkout data is available for this period.</p>
          </div>
        ) : (
          <ChartViewport minWidth="34rem">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyCheckouts} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                  formatter={(value) => [Number(value).toLocaleString(), "Check-outs"]}
                />
                <Legend wrapperStyle={{ color: "var(--foreground)", fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Check-outs"
                  stroke="var(--chart-this-year)"
                  strokeWidth={2.5}
                  dot={dailyCheckouts.length <= 31 ? { r: 3 } : false}
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

          {stats.recentComments.length > 0 ? (
            <div className="dashboard-card p-4 sm:p-5">
              <span className="dashboard-card-accent" aria-hidden />
              <p className="text-sm font-semibold text-foreground">Recent patient responses</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {onViewReview ? "Click a response to open the full review" : "Written responses from the survey"}
              </p>
              <ul className="mt-4 divide-y divide-border">
                {stats.recentComments.map((c) => (
                  <li key={`${c.id}-${c.kind}`} className="py-3 first:pt-0 last:pb-0">
                    {onViewReview ? (
                      <button
                        type="button"
                        onClick={() => onViewReview(c.id)}
                        className="w-full rounded-lg text-left transition hover:bg-surface-muted/40"
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="rounded-md bg-accent-muted px-2 py-0.5 text-[11px] font-medium text-nav-active-fg">
                            {c.kind}
                          </span>
                          <span className="text-xs text-muted-foreground">{formatWhen(c.createdAt)}</span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-foreground">{c.text}</p>
                      </button>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="rounded-md bg-accent-muted px-2 py-0.5 text-[11px] font-medium text-nav-active-fg">
                            {c.kind}
                          </span>
                          <span className="text-xs text-muted-foreground">{formatWhen(c.createdAt)}</span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-foreground">{c.text}</p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
