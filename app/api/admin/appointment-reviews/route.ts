import { NextResponse } from "next/server";
import { buildAppointmentReviewStats } from "@/lib/appointment-review/analytics";
import { authorizeAppointmentReviewReportRequest } from "@/lib/appointment-review/authorize";
import { toAppointmentReviewDetail } from "@/lib/appointment-review/display";
import { APPOINTMENT_REVIEWS_SETUP_SQL, listAppointmentReviews } from "@/lib/appointment-review/store";
import {
  buildProviderAppointmentReport,
  parseAppointmentReviewReportRange,
} from "@/lib/appointment-review/report";
import { getSessionFromCookies } from "@/lib/auth/session";
import { isNmacNavViewAllowed, SURVEY_RESULTS_NAV_VIEW_ID } from "@/lib/auth/role-nmac-nav";
import { getAppDashboardSettings } from "@/lib/auth/app-settings";
import { listSurveyOutreachForReport } from "@/lib/survey-outreach/store";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

export async function GET(req: Request) {
  const apiKeyAuthorized = authorizeAppointmentReviewReportRequest(req);
  const session = apiKeyAuthorized ? null : await getSessionFromCookies();
  if (!apiKeyAuthorized && !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session) {
    const settings = await getAppDashboardSettings();
    if (!isNmacNavViewAllowed(session.role, SURVEY_RESULTS_NAV_VIEW_ID, settings?.roleNmacNav ?? {})) {
      return unauthorized();
    }
  }

  const url = new URL(req.url);
  const parsedRange = parseAppointmentReviewReportRange(url.searchParams);
  if (!parsedRange.ok) {
    return NextResponse.json({ error: parsedRange.error }, { status: 400 });
  }
  const { range } = parsedRange;

  const [reviewsResult, outreachResult] = await Promise.all([
    listAppointmentReviews({ createdFrom: range.startAt, createdBefore: range.endBefore }),
    listSurveyOutreachForReport({ sentFrom: range.startAt, sentBefore: range.endBefore }),
  ]);
  if (!reviewsResult.ok) {
    if (reviewsResult.setupRequired) {
      return NextResponse.json(
        {
          setupRequired: true,
          setupSql: APPOINTMENT_REVIEWS_SETUP_SQL,
          error: reviewsResult.error ?? "Run the database setup to enable appointment reviews.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: reviewsResult.error ?? "Could not load reviews." }, { status: 500 });
  }
  if (!outreachResult.ok) {
    return NextResponse.json(
      {
        setupRequired: outreachResult.setupRequired ?? false,
        error: outreachResult.error ?? "Could not load sent survey data.",
      },
      { status: outreachResult.setupRequired ? 503 : 500 },
    );
  }

  const rows = reviewsResult.rows;
  const providerReport = buildProviderAppointmentReport(outreachResult.rows);

  return NextResponse.json(
    {
      dateStart: range.dateStart,
      dateEnd: range.dateEnd,
      numberSent: outreachResult.rows.length,
      numberResponses: rows.length,
      stats: buildAppointmentReviewStats(rows),
      providers: providerReport.providers,
      appointments: providerReport.appointments,
      reviews: rows.map(toAppointmentReviewDetail),
      ready: true,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
