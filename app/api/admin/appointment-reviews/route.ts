import { NextResponse } from "next/server";
import { buildAppointmentReviewStats } from "@/lib/appointment-review/analytics";
import { authorizeAppointmentReviewReportRequest } from "@/lib/appointment-review/authorize";
import { toAppointmentReviewDetail } from "@/lib/appointment-review/display";
import { APPOINTMENT_REVIEWS_SETUP_SQL, listAppointmentReviews } from "@/lib/appointment-review/store";
import {
  buildResponseOnlyAppointmentReport,
  buildProviderAppointmentReport,
  currentAppointmentReviewQuarter,
  mergeProviderAppointmentReports,
  parseAppointmentReviewReportRange,
} from "@/lib/appointment-review/report";
import { getSessionFromCookies } from "@/lib/auth/session";
import { isNmacNavViewAllowed, SURVEY_RESULTS_NAV_VIEW_ID } from "@/lib/auth/role-nmac-nav";
import { getAppDashboardSettings } from "@/lib/auth/app-settings";
import {
  findTestSurveyOutreachTokens,
  listSurveyOutreachForReport,
} from "@/lib/survey-outreach/store";
import { isScheduledTestRecipientAllowed } from "@/lib/survey-outreach/config";
import { summarizeUniqueInitialRecipients } from "@/lib/survey-outreach/sent-stats";

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
  const now = new Date();
  const parsedRange = parseAppointmentReviewReportRange(url.searchParams, now);
  if (!parsedRange.ok) {
    return NextResponse.json({ error: parsedRange.error }, { status: 400 });
  }
  const { range } = parsedRange;
  const includeTestsParam = url.searchParams.get("includeTests");
  if (includeTestsParam !== null && includeTestsParam !== "true" && includeTestsParam !== "false") {
    return NextResponse.json({ error: "includeTests must be true or false." }, { status: 400 });
  }
  const includeTests = includeTestsParam === "true";

  const [reviewsResult, outreachResult] = await Promise.all([
    listAppointmentReviews({ createdFrom: range.startAt, createdBefore: range.endBefore }),
    listSurveyOutreachForReport({
      sentFrom: range.startAt,
      sentBefore: range.endBefore,
      includeTests,
    }),
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

  const testTokenResult = await findTestSurveyOutreachTokens(
    reviewsResult.rows
      .map((row) => row.survey_token)
      .filter((token): token is string => Boolean(token)),
  );
  if (!testTokenResult.ok) {
    return NextResponse.json({ error: testTokenResult.error }, { status: 500 });
  }
  const testTokens = new Set(testTokenResult.tokens);
  const isTestReview = (row: (typeof reviewsResult.rows)[number]) =>
    row.survey_token
      ? testTokens.has(row.survey_token)
      : isScheduledTestRecipientAllowed(row.email);

  let rows = reviewsResult.rows;
  if (!includeTests) rows = rows.filter((row) => !isTestReview(row));

  const reviews = rows.map((row) => toAppointmentReviewDetail(row, isTestReview(row)));
  const providerNamesBySurveyToken = new Map<string, string[]>();
  rows.forEach((row, index) => {
    if (!row.survey_token) return;
    const providerNames = reviews[index].providerRatings.map((provider) => provider.providerLabel);
    if (providerNames.length > 0) providerNamesBySurveyToken.set(row.survey_token, providerNames);
  });
  const reportOutreachRows = outreachResult.rows.map((row) => ({
    ...row,
    provider_names:
      row.provider_names?.length > 0
        ? row.provider_names
        : providerNamesBySurveyToken.get(row.survey_token) ?? [],
  }));
  const outreachProviderReport = buildProviderAppointmentReport(reportOutreachRows);
  const reportedSurveyTokens = new Set(outreachResult.rows.map((row) => row.survey_token));
  const responseOnlyProviderReport = buildResponseOnlyAppointmentReport(
    rows.flatMap((row, index) => {
      if (row.survey_token && reportedSurveyTokens.has(row.survey_token)) return [];
      return [{
        reviewId: row.id,
        createdAt: row.created_at,
        providerNames: reviews[index].providerRatings.map((provider) => provider.providerLabel),
        isTest: reviews[index].isTest,
      }];
    }),
  );
  const providerReport = mergeProviderAppointmentReports(
    outreachProviderReport,
    responseOnlyProviderReport,
  );
  const initialRecipients = summarizeUniqueInitialRecipients(outreachResult.rows);

  return NextResponse.json(
    {
      dateStart: range.dateStart,
      dateEnd: range.dateEnd,
      includeTests,
      numberSent: initialRecipients.total,
      numberResponses: rows.length,
      quarter: range.quarter ?? null,
      currentQuarter: currentAppointmentReviewQuarter(now),
      eligibleEntries: range.quarter && !includeTests ? rows.length : null,
      stats: buildAppointmentReviewStats(rows),
      providers: providerReport.providers,
      appointments: providerReport.appointments,
      reviews,
      ready: true,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
