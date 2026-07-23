import { CalendarRange, Gift, Users } from "lucide-react";
import type { AppointmentReviewQuarter } from "@/lib/appointment-review/report";

type Props = {
  quarter: AppointmentReviewQuarter;
  eligibleEntries: number;
};

function dateValue(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateValue(value));
}

function formatDateRange(startValue: string, endValue: string): string {
  const start = dateValue(startValue);
  const end = dateValue(endValue);
  const sameMonth = start.getUTCFullYear() === end.getUTCFullYear()
    && start.getUTCMonth() === end.getUTCMonth();

  if (sameMonth) {
    const month = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" }).format(start);
    return `${month} ${start.getUTCDate()}-${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  return `${formatDate(startValue)} - ${formatDate(endValue)}`;
}

export function QuarterlyDrawSummary({ quarter, eligibleEntries }: Props) {
  const statusLabel = quarter.status === "open"
    ? "Entries open"
    : quarter.status === "closed"
      ? "Quarter finalized"
      : "Upcoming";
  const statusClass = quarter.status === "open"
    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : quarter.status === "closed"
      ? "bg-accent-muted text-nav-active-fg"
      : "bg-surface-muted text-muted-foreground";
  const summary = quarter.status === "open"
    ? `Entries remain open through ${formatDate(quarter.dateEnd)}. The final participant list locks on ${formatDate(quarter.resultsFinalDate)}.`
    : quarter.status === "closed"
      ? `This quarter is closed. The participant list below is final for ${quarter.label}.`
      : `Entries for this quarter open on ${formatDate(quarter.dateStart)}.`;

  return (
    <section className="dashboard-card mb-6 overflow-hidden" aria-labelledby="quarterly-draw-title">
      <span className="dashboard-card-accent" aria-hidden />
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-nav-active-fg">
            <Gift className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="quarterly-draw-title" className="text-sm font-semibold text-foreground">
                {quarter.label} quarterly gift voucher draw
              </h2>
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}>
                {statusLabel}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{summary}</p>
          </div>
        </div>
      </div>

      <dl className="grid border-t border-border sm:grid-cols-3">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <dt className="text-[11px] font-semibold uppercase text-muted-foreground">Eligible entries</dt>
            <dd className="mt-0.5 text-sm font-semibold text-foreground">{eligibleEntries}</dd>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-border px-4 py-3 sm:border-l sm:border-t-0 sm:px-5">
          <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <dt className="text-[11px] font-semibold uppercase text-muted-foreground">Entries close</dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">{formatDate(quarter.dateEnd)}</dd>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-border px-4 py-3 sm:border-l sm:border-t-0 sm:px-5">
          <Gift className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <dt className="text-[11px] font-semibold uppercase text-muted-foreground">Announce winners</dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">
              {formatDateRange(quarter.announcementStartDate, quarter.announcementEndDate)}
            </dd>
          </div>
        </div>
      </dl>
    </section>
  );
}
