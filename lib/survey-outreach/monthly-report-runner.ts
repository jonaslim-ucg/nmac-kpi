import { buildAppointmentReviewStats, type AppointmentReviewRow } from "@/lib/appointment-review/analytics";
import { normalizeAppointmentReviewActionStatus } from "@/lib/appointment-review/management";
import { parseAppointmentReviewReportRange } from "@/lib/appointment-review/report";
import { listAppointmentReviews } from "@/lib/appointment-review/store";
import { isTestimonialPermissionGranted } from "@/lib/appointment-review/types";
import { sendMailViaGraph } from "@/lib/graph/send-mail";
import { listInitialSurveyBouncesForReport } from "@/lib/survey-outreach/bounce-store";
import { isScheduledTestRecipientAllowed } from "@/lib/survey-outreach/config";
import {
  buildSurveyMonthlyReportEmail,
  type SurveyMonthlyReportSummary,
} from "@/lib/survey-outreach/monthly-report-email";
import {
  surveyMonthlyReportPeriod,
  validateSurveyMonthlyReportConfig,
  type SurveyMonthlyReportPeriod,
} from "@/lib/survey-outreach/monthly-report-config";
import {
  claimSurveyMonthlyReportDelivery,
  completeSurveyMonthlyReportDelivery,
  getSurveyMonthlyReportConfig,
  recordSurveyMonthlyReportRun,
  type SurveyMonthlyReportRunResult,
} from "@/lib/survey-outreach/monthly-report-settings";
import { countSuccessfulInitialSurveySends } from "@/lib/survey-outreach/sent-stats";
import {
  findSurveyOutreachReviewMetadata,
  listSurveyOutreachForReport,
} from "@/lib/survey-outreach/store";
import { surveyBaseUrl } from "@/lib/survey-outreach/urls";

export type SurveyMonthlyReportSchedulerResult = SurveyMonthlyReportRunResult & {
  enabled: boolean;
  due: boolean;
  scheduledAt: string;
  error?: string;
};

function averageOrNull(value: number, hasResponses: boolean): number | null {
  return hasResponses && Number.isFinite(value) && value > 0 ? value : null;
}

async function productionReviewRows(rows: AppointmentReviewRow[]): Promise<AppointmentReviewRow[]> {
  const metadata = await findSurveyOutreachReviewMetadata(
    rows
      .map((row) => row.survey_token)
      .filter((token): token is string => Boolean(token)),
  );
  if (!metadata.ok) throw new Error(metadata.error);
  const testByToken = new Map(metadata.rows.map((item) => [item.surveyToken, item.isTest]));
  return rows.filter((row) => {
    if (row.survey_token && testByToken.get(row.survey_token) === true) return false;
    return !isScheduledTestRecipientAllowed(row.email);
  });
}

export async function buildSurveyMonthlyReportSummary(
  period: SurveyMonthlyReportPeriod,
): Promise<SurveyMonthlyReportSummary> {
  const parsedRange = parseAppointmentReviewReportRange(new URLSearchParams({
    dateStart: period.dateStart,
    dateEnd: period.dateEnd,
  }));
  if (!parsedRange.ok) throw new Error(parsedRange.error);
  const [reviewResult, outreachResult, bounceResult] = await Promise.all([
    listAppointmentReviews({
      createdFrom: parsedRange.range.startAt,
      createdBefore: parsedRange.range.endBefore,
    }),
    listSurveyOutreachForReport({
      appointmentDateStart: period.dateStart,
      appointmentDateEnd: period.dateEnd,
      includeTests: false,
    }),
    listInitialSurveyBouncesForReport(),
  ]);
  if (!reviewResult.ok) throw new Error(reviewResult.error);
  if (!outreachResult.ok) throw new Error(outreachResult.error);
  if (!bounceResult.ok) throw new Error(bounceResult.error);

  const reviews = await productionReviewRows(reviewResult.rows);
  const stats = buildAppointmentReviewStats(reviews);
  const surveysSent = countSuccessfulInitialSurveySends(outreachResult.rows, bounceResult.rows);
  const statusCounts = {
    needsReview: 0,
    inProgress: 0,
    actioned: 0,
    noActionNeeded: 0,
  };
  for (const review of reviews) {
    switch (normalizeAppointmentReviewActionStatus(review.feedback_status)) {
      case "in_progress":
        statusCounts.inProgress += 1;
        break;
      case "actioned":
        statusCounts.actioned += 1;
        break;
      case "no_action_needed":
        statusCounts.noActionNeeded += 1;
        break;
      default:
        statusCounts.needsReview += 1;
    }
  }
  const hasResponses = reviews.length > 0;

  return {
    periodKey: period.periodKey,
    periodLabel: period.label,
    dateStart: period.dateStart,
    dateEnd: period.dateEnd,
    surveysSent,
    responses: reviews.length,
    responseRate: surveysSent > 0 ? Math.round((reviews.length / surveysSent) * 1000) / 10 : null,
    averages: {
      scheduling: averageOrNull(stats.averages.appointmentEase, hasResponses),
      visit: averageOrNull(stats.averages.visitRating, hasResponses),
      provider: averageOrNull(stats.averages.providerRating, hasResponses),
      health: averageOrNull(stats.averages.healthRating, hasResponses),
      recommend: averageOrNull(stats.averages.recommendationRating, hasResponses),
      frontDesk: averageOrNull(stats.averages.frontDeskRating, hasResponses),
    },
    testimonials: reviews.filter(
      (row) =>
        isTestimonialPermissionGranted(row.testimonial_permission) &&
        row.testimonial_text.trim().length > 0,
    ).length,
    exceptionalStaffResponses: reviews.filter(
      (row) => row.exceptional_staff_comment.trim().length > 0,
    ).length,
    handling: statusCounts,
    dashboardUrl: `${surveyBaseUrl()}/admin/appointment-reviews`,
  };
}

function emptyResult(period: SurveyMonthlyReportPeriod): SurveyMonthlyReportRunResult {
  return {
    periodKey: period.periodKey,
    periodLabel: period.label,
    sent: 0,
    skipped: 0,
    errors: 0,
    recipients: 0,
  };
}

export async function runSurveyMonthlyReportScheduler(
  now = new Date(),
): Promise<SurveyMonthlyReportSchedulerResult> {
  const config = await getSurveyMonthlyReportConfig();
  const period = surveyMonthlyReportPeriod(config, now);
  const result = emptyResult(period);
  const base = {
    ...result,
    enabled: config.enabled,
    due: period.due,
    scheduledAt: period.scheduledAt,
  };
  if (!config.enabled || !period.due) return base;

  const validationError = validateSurveyMonthlyReportConfig(config);
  if (validationError) {
    const failed = { ...base, errors: 1, error: validationError };
    await recordSurveyMonthlyReportRun({
      at: now.toISOString(),
      successful: false,
      error: validationError,
      result: failed,
    }).catch(() => undefined);
    return failed;
  }

  const recipients = config.recipients.filter((recipient) => recipient.enabled);
  result.recipients = recipients.length;
  try {
    const summary = await buildSurveyMonthlyReportSummary(period);
    const errors: string[] = [];
    for (const recipient of recipients) {
      const delivery = await claimSurveyMonthlyReportDelivery({
        periodKey: period.periodKey,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
      });
      if (!delivery) {
        result.skipped += 1;
        continue;
      }

      try {
        const email = buildSurveyMonthlyReportEmail({
          recipientName: recipient.name,
          summary,
        });
        await sendMailViaGraph({
          to: recipient.email,
          subject: email.subject,
          textBody: email.textBody,
          htmlBody: email.htmlBody,
          deliveryKey: delivery.id,
        });
        await completeSurveyMonthlyReportDelivery({ id: delivery.id, sent: true });
        result.sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Monthly report delivery failed.";
        result.errors += 1;
        errors.push(`${recipient.email}: ${message}`);
        await completeSurveyMonthlyReportDelivery({
          id: delivery.id,
          sent: false,
          error: message.slice(0, 1000),
        }).catch(() => undefined);
      }
    }

    const lastError = errors.length > 0 ? errors.join(" | ").slice(0, 2000) : null;
    await recordSurveyMonthlyReportRun({
      at: now.toISOString(),
      successful: result.errors === 0,
      error: lastError,
      result,
    });
    return { ...base, ...result, ...(lastError ? { error: lastError } : {}) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build monthly survey report.";
    result.errors += 1;
    await recordSurveyMonthlyReportRun({
      at: now.toISOString(),
      successful: false,
      error: message,
      result,
    }).catch(() => undefined);
    return { ...base, ...result, error: message };
  }
}

export async function sendSurveyMonthlyReportTest(input: {
  to: string;
  recipientName: string;
  now?: Date;
}): Promise<{ to: string; periodLabel: string }> {
  const config = await getSurveyMonthlyReportConfig();
  const period = surveyMonthlyReportPeriod(config, input.now ?? new Date());
  const summary = await buildSurveyMonthlyReportSummary(period);
  const email = buildSurveyMonthlyReportEmail({
    recipientName: input.recipientName,
    summary,
    test: true,
  });
  await sendMailViaGraph({
    to: input.to,
    subject: email.subject,
    textBody: email.textBody,
    htmlBody: email.htmlBody,
    deliveryKey: crypto.randomUUID(),
  });
  return { to: input.to, periodLabel: period.label };
}
