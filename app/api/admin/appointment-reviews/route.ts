import { NextResponse } from "next/server";
import { buildAppointmentReviewStats } from "@/lib/appointment-review/analytics";
import { toAppointmentReviewDetail } from "@/lib/appointment-review/display";
import { APPOINTMENT_REVIEWS_SETUP_SQL, listAppointmentReviews } from "@/lib/appointment-review/store";
import { getSessionFromCookies } from "@/lib/auth/session";
import { isNmacNavViewAllowed, SURVEY_RESULTS_NAV_VIEW_ID } from "@/lib/auth/role-nmac-nav";
import { getAppDashboardSettings } from "@/lib/auth/app-settings";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

function currentQuarterRange(now = new Date()): { start: number; end: number } {
  const year = now.getUTCFullYear();
  const startMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  return {
    start: Date.UTC(year, startMonth, 1),
    end: Date.UTC(year, startMonth + 3, 1),
  };
}

export async function GET(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getAppDashboardSettings();
  if (!isNmacNavViewAllowed(session.role, SURVEY_RESULTS_NAV_VIEW_ID, settings?.roleNmacNav ?? {})) {
    return unauthorized();
  }

  const url = new URL(req.url);
  const daysRaw = url.searchParams.get("days");
  const range = url.searchParams.get("range");
  const days = daysRaw ? Number(daysRaw) : null;

  const filters: { createdFrom?: string; createdBefore?: string } = {};
  if (range === "quarter") {
    const { start, end } = currentQuarterRange();
    filters.createdFrom = new Date(start).toISOString();
    filters.createdBefore = new Date(end).toISOString();
  } else if (days && Number.isFinite(days) && days > 0) {
    filters.createdFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  const result = await listAppointmentReviews(filters);
  if (!result.ok) {
    if (result.setupRequired) {
      return NextResponse.json(
        {
          setupRequired: true,
          setupSql: APPOINTMENT_REVIEWS_SETUP_SQL,
          error: result.error ?? "Run the database setup to enable appointment reviews.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: result.error ?? "Could not load reviews." }, { status: 500 });
  }

  const rows = result.rows;

  return NextResponse.json(
    {
      stats: buildAppointmentReviewStats(rows),
      reviews: rows.map(toAppointmentReviewDetail),
      ready: true,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
