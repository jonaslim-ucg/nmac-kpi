import { NextResponse } from "next/server";
import { buildAppointmentReviewStats } from "@/lib/appointment-review/analytics";
import { authorizeAppointmentReviewReportRequest } from "@/lib/appointment-review/authorize";
import { toAppointmentReviewDetail } from "@/lib/appointment-review/display";
import { parseAppointmentReviewManagementInput } from "@/lib/appointment-review/management";
import {
  APPOINTMENT_REVIEWS_SETUP_SQL,
  listAppointmentReviews,
  updateAppointmentReviewManagement,
} from "@/lib/appointment-review/store";
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
  findSurveyOutreachReviewMetadata,
  getSurveyOutreachReportingStartDate,
  listDailyCheckoutCountsForReport,
  listPermanentSurveyDeliveryFailuresForReport,
  listSurveyOutreachForReport,
  listSurveyOutreachStatesForReport,
} from "@/lib/survey-outreach/store";
import { isScheduledTestRecipientAllowed } from "@/lib/survey-outreach/config";
import {
  buildDailyInitialSurveySendTrend,
  classifyInitialSurveySends,
  summarizeInitialSurveyKpis,
} from "@/lib/survey-outreach/sent-stats";
import {
  listInitialSurveyBouncesForReport,
  listSurveyOutreachBouncesForReport,
} from "@/lib/survey-outreach/bounce-store";
import {
  buildDailyCheckoutTrend,
  summarizeDailyCheckouts,
} from "@/lib/survey-outreach/checkout-stats";
import { summarizeTrackedSurveyEmailFailures } from "@/lib/survey-outreach/failure-stats";
import {
  checkoutRowsSinceSurveyLaunch,
  reconcileSurveyCheckouts,
} from "@/lib/survey-outreach/checkout-reconciliation";

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

  const [
    reviewsResult,
    outreachResult,
    outreachStateResult,
    initialBounceResult,
    deliveryBounceResult,
    permanentFailureResult,
    permanentInitialFailureResult,
    dailyCheckoutResult,
    reportingStartResult,
  ] = await Promise.all([
    listAppointmentReviews({ createdFrom: range.startAt, createdBefore: range.endBefore }),
    listSurveyOutreachForReport({
      appointmentDateStart: range.dateStart ?? undefined,
      appointmentDateEnd: range.dateEnd ?? undefined,
      includeTests,
    }),
    listSurveyOutreachStatesForReport({
      appointmentDateStart: range.dateStart ?? undefined,
      appointmentDateEnd: range.dateEnd ?? undefined,
      includeTests,
    }),
    listInitialSurveyBouncesForReport(),
    listSurveyOutreachBouncesForReport({
      receivedFrom: range.startAt,
      receivedBefore: range.endBefore,
      includeTests,
    }),
    listPermanentSurveyDeliveryFailuresForReport({
      failedFrom: range.startAt,
      failedBefore: range.endBefore,
      includeTests,
    }),
    listPermanentSurveyDeliveryFailuresForReport({
      appointmentDateStart: range.dateStart ?? undefined,
      appointmentDateEnd: range.dateEnd ?? undefined,
      stage: "initial",
      includeTests,
    }),
    listDailyCheckoutCountsForReport({
      dateStart: range.dateStart,
      dateEnd: range.dateEnd,
    }),
    getSurveyOutreachReportingStartDate(),
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
  if (!outreachStateResult.ok) {
    return NextResponse.json(
      {
        setupRequired: outreachStateResult.setupRequired ?? false,
        error: outreachStateResult.error ?? "Could not load survey delivery states.",
      },
      { status: outreachStateResult.setupRequired ? 503 : 500 },
    );
  }
  if (!initialBounceResult.ok) {
    return NextResponse.json(
      {
        setupRequired: initialBounceResult.setupRequired ?? false,
        error: initialBounceResult.error,
      },
      { status: initialBounceResult.setupRequired ? 503 : 500 },
    );
  }
  if (!deliveryBounceResult.ok) {
    return NextResponse.json(
      {
        setupRequired: deliveryBounceResult.setupRequired ?? false,
        error: deliveryBounceResult.error,
      },
      { status: deliveryBounceResult.setupRequired ? 503 : 500 },
    );
  }
  if (!permanentFailureResult.ok) {
    return NextResponse.json(
      {
        setupRequired: permanentFailureResult.setupRequired ?? false,
        error: permanentFailureResult.error,
      },
      { status: permanentFailureResult.setupRequired ? 503 : 500 },
    );
  }
  if (!permanentInitialFailureResult.ok) {
    return NextResponse.json(
      {
        setupRequired: permanentInitialFailureResult.setupRequired ?? false,
        error: permanentInitialFailureResult.error,
      },
      { status: permanentInitialFailureResult.setupRequired ? 503 : 500 },
    );
  }
  if (!reportingStartResult.ok) {
    return NextResponse.json({ error: reportingStartResult.error }, { status: 500 });
  }
  const reviewMetadataResult = await findSurveyOutreachReviewMetadata(
    reviewsResult.rows
      .map((row) => row.survey_token)
      .filter((token): token is string => Boolean(token)),
  );
  if (!reviewMetadataResult.ok) {
    return NextResponse.json({ error: reviewMetadataResult.error }, { status: 500 });
  }
  const reviewMetadataByToken = new Map(
    reviewMetadataResult.rows.map((metadata) => [metadata.surveyToken, metadata]),
  );
  const isTestReview = (row: (typeof reviewsResult.rows)[number]) =>
    row.survey_token
      ? reviewMetadataByToken.get(row.survey_token)?.isTest ?? false
      : isScheduledTestRecipientAllowed(row.email);

  let rows = reviewsResult.rows;
  if (!includeTests) rows = rows.filter((row) => !isTestReview(row));

  const reviews = rows.map((row) => {
    const metadata = row.survey_token
      ? reviewMetadataByToken.get(row.survey_token)
      : undefined;
    return toAppointmentReviewDetail(row, {
      isTest: isTestReview(row),
      appointmentDate: metadata?.appointmentDate ?? null,
      appointmentAt: metadata?.appointmentAt ?? null,
      providerNames: metadata?.providerNames ?? [],
      visitTypes: metadata?.visitTypes ?? [],
      includeFeedbackManagement: Boolean(session),
    });
  });
  const responseAtBySurveyToken = new Map(
    rows.flatMap((row) => row.survey_token ? [[row.survey_token, row.created_at] as const] : []),
  );
  const initialSendClassification = classifyInitialSurveySends(
    outreachResult.rows,
    initialBounceResult.rows,
  );
  const failedInitialOutreachIds = new Set(
    initialSendClassification.failedRows.map((row) => row.id),
  );
  const initialSurveyKpis = summarizeInitialSurveyKpis(
    outreachResult.rows,
    initialBounceResult.rows,
    permanentInitialFailureResult.rows,
  );
  const providerNamesBySurveyToken = new Map<string, string[]>();
  rows.forEach((row, index) => {
    if (!row.survey_token) return;
    const providerNames = reviews[index].providerRatings.map((provider) => provider.providerLabel);
    if (providerNames.length > 0) providerNamesBySurveyToken.set(row.survey_token, providerNames);
  });
  const reportOutreachRows = outreachResult.rows.map((row) => ({
    ...row,
    initial_delivery_failed: failedInitialOutreachIds.has(row.id),
    completed_at: responseAtBySurveyToken.get(row.survey_token) ?? null,
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
  const dailyCheckoutRows = dailyCheckoutResult.ok ? dailyCheckoutResult.rows : [];
  const surveyCheckoutRows = checkoutRowsSinceSurveyLaunch(
    dailyCheckoutRows,
    reportingStartResult.date,
  );
  const dailyCheckouts = buildDailyCheckoutTrend(surveyCheckoutRows);
  const dailySurveySends = buildDailyInitialSurveySendTrend(
    outreachResult.rows,
    initialBounceResult.rows,
  );
  const checkoutSummary = summarizeDailyCheckouts(surveyCheckoutRows);
  const deliveryFailureStats = summarizeTrackedSurveyEmailFailures(
    deliveryBounceResult.rows,
    permanentFailureResult.rows,
  );
  const checkoutReconciliation = {
    ...reconcileSurveyCheckouts(
      surveyCheckoutRows,
      outreachStateResult.rows,
      initialBounceResult.rows,
    ),
    reportingStartDate: reportingStartResult.date,
  };

  return NextResponse.json(
    {
      dateStart: range.dateStart,
      dateEnd: range.dateEnd,
      includeTests,
      surveyReportingStartDate: reportingStartResult.date,
      dateBasis: {
        initialSurveyKpis: "appointment_date",
        providerAppointmentsAndSends: "appointment_date",
        dailyCheckouts: "appointment_date_from_first_production_send",
        dailySurveySends: "appointment_date",
        responses: "submitted_at",
        deliveryFailureEvents: "failure_event_at",
        checkoutReconciliation: "appointment_date_from_first_production_send",
      },
      kpis: {
        appointmentCheckouts: checkoutSummary.checkouts,
        multipleSameDayAppointments: checkoutSummary.multipleSameDayAppointments,
        initialSurveyAttempts: initialSurveyKpis.attempted,
        initialSurveysSent: initialSurveyKpis.successful,
        uniqueInitialRecipients: initialSurveyKpis.uniqueSuccessfulRecipients,
        repeatInitialSends: initialSurveyKpis.repeatSuccessful,
        failedInitialSends: initialSurveyKpis.failed,
        bouncedInitialSends: initialSurveyKpis.bounced,
        permanentInitialFailures: initialSurveyKpis.permanentPreSendFailures,
        noEmail: checkoutReconciliation.ready ? checkoutReconciliation.noEmail : null,
        notSent: checkoutReconciliation.ready ? checkoutReconciliation.notSent : null,
        totalResponses: rows.length,
      },
      numberCheckouts: checkoutSummary.checkouts,
      numberMultipleSameDayAppointments: checkoutSummary.multipleSameDayAppointments,
      numberInitialSurveyAttempts: initialSurveyKpis.attempted,
      numberSent: initialSurveyKpis.successful,
      numberUniqueInitialRecipients: initialSurveyKpis.uniqueSuccessfulRecipients,
      numberRepeatInitialSends: initialSurveyKpis.repeatSuccessful,
      numberFailedInitialSends: initialSurveyKpis.failed,
      numberBouncedInitialSends: initialSurveyKpis.bounced,
      numberPermanentInitialFailures: initialSurveyKpis.permanentPreSendFailures,
      numberNoEmail: checkoutReconciliation.ready ? checkoutReconciliation.noEmail : null,
      numberNotSent: checkoutReconciliation.ready ? checkoutReconciliation.notSent : null,
      numberFailedEmails: deliveryFailureStats.total,
      numberBounceReports: deliveryFailureStats.bounceReports,
      numberPermanentSendFailures: deliveryFailureStats.permanentSendFailures,
      dailyCheckouts,
      dailySurveySends,
      checkoutReconciliation,
      discrepancies: checkoutReconciliation.discrepancies,
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

export async function PATCH(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getAppDashboardSettings();
  if (!isNmacNavViewAllowed(session.role, SURVEY_RESULTS_NAV_VIEW_ID, settings?.roleNmacNav ?? {})) {
    return unauthorized();
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const id = typeof record.id === "string"
    ? record.id.trim()
    : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid review id." }, { status: 400 });
  }

  const parsed = parseAppointmentReviewManagementInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await updateAppointmentReviewManagement(id, parsed.input, session.email);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        setupRequired: result.setupRequired ?? false,
        setupSql: result.setupRequired ? APPOINTMENT_REVIEWS_SETUP_SQL : undefined,
      },
      { status: result.notFound ? 404 : result.setupRequired ? 503 : 500 },
    );
  }

  return NextResponse.json(
    { management: result.management },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
