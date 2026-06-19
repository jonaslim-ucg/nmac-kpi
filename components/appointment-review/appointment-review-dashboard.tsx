"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { SummaryCards } from "@/components/dashboard/summary-cards";

const CHART_COLORS = [
  "var(--chart-this-year)",
  "var(--chart-target)",
  "var(--accent-2)",
  "#8b5cf6",
  "#f59e0b",
];

const YES_NO_COLORS = ["var(--chart-this-year)", "#64748b"];

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

function YesNoPie({ title, data }: { title: string; data: AppointmentReviewStats["yesNo"]["isPatient"] }) {
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
              contentStyle={{
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--foreground)",
              }}
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

type Props = { stats: AppointmentReviewStats };

export function AppointmentReviewDashboard({ stats }: Props) {
  const empty = stats.total === 0;

  return (
    <div className="space-y-6">
      <SummaryCards
        cards={[
          {
            label: "Total responses",
            value: String(stats.total),
            hint: "Appointment review submissions",
          },
          {
            label: "Avg. recommend score",
            value: empty ? "—" : `${stats.averages.recommendLikelihood}/10`,
            hint: "How likely patients are to recommend",
          },
          {
            label: "Promoters (9–10)",
            value: empty ? "—" : `${stats.promotersPct}%`,
            hint: "Share giving top recommend scores",
          },
          {
            label: "Avg. visit rating",
            value: empty ? "—" : `${stats.averages.visitRating}/10`,
            hint: "Overall visit experience",
          },
        ]}
      />

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
            <ChartCard title="Average ratings" subtitle="Scale 1 (worst) to 10 (best)" tall>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.ratingScores} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                  <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--border)" />
                  <YAxis
                    type="category"
                    dataKey="metric"
                    width={108}
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                    stroke="var(--border)"
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      color: "var(--foreground)",
                    }}
                    formatter={(value) => [`${value}/10`, "Average"]}
                  />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                    {stats.ratingScores.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Recommend & visit trend" subtitle="Daily averages when multiple responses exist" tall>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.ratingTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDay}
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                    stroke="var(--border)"
                  />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--border)" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      color: "var(--foreground)",
                    }}
                    labelFormatter={(label) => formatDay(String(label ?? ""))}
                    formatter={(value, name) => [`${value}/10`, String(name)]}
                  />
                  <Legend wrapperStyle={{ color: "var(--foreground)", fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="recommend"
                    name="Recommend"
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
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Wait time before exam room">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.waitTime} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted)" }} stroke="var(--border)" interval={0} angle={-12} textAnchor="end" height={52} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--border)" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      color: "var(--foreground)",
                    }}
                    formatter={(value, _name, item) => {
                      const pct = (item.payload as { pct?: number }).pct;
                      return [`${value} (${pct ?? 0}%)`, "Responses"];
                    }}
                  />
                  <Bar dataKey="count" fill="var(--chart-this-year)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Patient tenure">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.patientDuration} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted)" }} stroke="var(--border)" interval={0} angle={-12} textAnchor="end" height={52} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--border)" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      color: "var(--foreground)",
                    }}
                    formatter={(value, _name, item) => {
                      const pct = (item.payload as { pct?: number }).pct;
                      return [`${value} (${pct ?? 0}%)`, "Responses"];
                    }}
                  />
                  <Bar dataKey="count" fill="var(--accent-2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <YesNoPie title="Provider spent enough time" data={stats.yesNo.providerTimeAdequate} />
            <YesNoPie title="Understand diagnosis & treatment" data={stats.yesNo.understandDiagnosis} />
            <YesNoPie title="Respondent is a patient" data={stats.yesNo.isPatient} />
          </div>

          {stats.recentComments.length > 0 ? (
            <div className="dashboard-card p-4 sm:p-5">
              <span className="dashboard-card-accent" aria-hidden />
              <p className="text-sm font-semibold text-foreground">Recent patient comments</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Optional free-text responses from the survey</p>
              <ul className="mt-4 divide-y divide-border">
                {stats.recentComments.map((c) => (
                  <li key={`${c.id}-${c.kind}`} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="rounded-md bg-accent-muted px-2 py-0.5 text-[11px] font-medium text-nav-active-fg">
                        {c.kind}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatWhen(c.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-foreground">{c.text}</p>
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
