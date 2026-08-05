import type { DailyCheckoutCountRow, DailyCheckoutSurveyGroup } from "./checkout-stats.ts";
import type { InitialSurveyBounceRow } from "./sent-stats.ts";
import { classifyInitialSurveySends } from "./sent-stats.ts";
import type { SurveyOutreachRow } from "./types.ts";

export type SurveyCheckoutDiscrepancyBucket = {
  groupCount: number;
  appointmentCount: number;
  appointmentIds: string[];
};

export type SurveyCheckoutDiscrepancies = {
  sentThroughSameDayGroup: SurveyCheckoutDiscrepancyBucket;
  pendingNotSent: SurveyCheckoutDiscrepancyBucket;
  emailWithoutOutreach: SurveyCheckoutDiscrepancyBucket;
  noEmail: SurveyCheckoutDiscrepancyBucket;
  bounced: SurveyCheckoutDiscrepancyBucket;
  failedBeforeSend: SurveyCheckoutDiscrepancyBucket;
  suppressedBeforeSend: SurveyCheckoutDiscrepancyBucket;
};

export type SurveyCheckoutReconciliation = {
  ready: boolean;
  trackedDates: number;
  snapshotDates: number;
  patientDayGroups: number;
  noEmail: number;
  notSent: number;
  discrepancies: SurveyCheckoutDiscrepancies;
};

type ReconciliationOutreachRow = Pick<
  SurveyOutreachRow,
  | "id"
  | "crm_appointment_id"
  | "crm_appointment_ids"
  | "patient_email"
  | "is_test"
  | "initial_sent_at"
  | "failed_stage"
  | "permanently_failed_at"
  | "recalled_at"
>;

type MutableBucket = {
  groupCount: number;
  appointmentIds: Set<string>;
};

function createBucket(): MutableBucket {
  return { groupCount: 0, appointmentIds: new Set<string>() };
}

function normalizedAppointmentIds(values: readonly unknown[]): string[] {
  return [...new Set(values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function outreachAppointmentIds(row: ReconciliationOutreachRow): string[] {
  return normalizedAppointmentIds([
    row.crm_appointment_id,
    ...(Array.isArray(row.crm_appointment_ids) ? row.crm_appointment_ids : []),
  ]);
}

function addToBucket(bucket: MutableBucket, appointmentIds: readonly string[]): void {
  bucket.groupCount += 1;
  appointmentIds.forEach((id) => bucket.appointmentIds.add(id));
}

function finishBucket(bucket: MutableBucket): SurveyCheckoutDiscrepancyBucket {
  const appointmentIds = normalizedAppointmentIds([...bucket.appointmentIds]);
  return {
    groupCount: bucket.groupCount,
    appointmentCount: appointmentIds.length,
    appointmentIds,
  };
}

function validSnapshotGroups(row: DailyCheckoutCountRow): DailyCheckoutSurveyGroup[] | null {
  if (!Array.isArray(row.survey_groups)) return null;
  return row.survey_groups.flatMap((group) => {
    if (!group || typeof group !== "object" || typeof group.hasEmail !== "boolean") return [];
    return [{
      appointmentIds: normalizedAppointmentIds(
        Array.isArray(group.appointmentIds) ? group.appointmentIds : [],
      ),
      hasEmail: group.hasEmail,
    }];
  });
}

/** Reconcile CRM patient-day checkout groups with every outreach delivery state. */
export function reconcileSurveyCheckouts(
  dailyRows: readonly DailyCheckoutCountRow[],
  outreachRows: readonly ReconciliationOutreachRow[],
  initialBounces: readonly InitialSurveyBounceRow[] = [],
): SurveyCheckoutReconciliation {
  const buckets = {
    sentThroughSameDayGroup: createBucket(),
    pendingNotSent: createBucket(),
    emailWithoutOutreach: createBucket(),
    noEmail: createBucket(),
    bounced: createBucket(),
    failedBeforeSend: createBucket(),
    suppressedBeforeSend: createBucket(),
  };
  const sentRows = outreachRows.filter((row) => Boolean(row.initial_sent_at));
  const { failedRows: bouncedRows } = classifyInitialSurveySends(sentRows, initialBounces);
  const bouncedOutreachIds = new Set(bouncedRows.map((row) => row.id));

  for (const row of bouncedRows) {
    addToBucket(buckets.bounced, outreachAppointmentIds(row));
  }

  for (const row of outreachRows) {
    if (
      !row.initial_sent_at &&
      row.failed_stage === "initial" &&
      Boolean(row.permanently_failed_at)
    ) {
      addToBucket(buckets.failedBeforeSend, outreachAppointmentIds(row));
    }
  }

  const outreachByAppointmentId = new Map<string, ReconciliationOutreachRow[]>();
  for (const row of outreachRows) {
    for (const appointmentId of outreachAppointmentIds(row)) {
      const matches = outreachByAppointmentId.get(appointmentId) ?? [];
      if (!matches.some((match) => match.id === row.id)) matches.push(row);
      outreachByAppointmentId.set(appointmentId, matches);
    }
  }

  let trackedDates = 0;
  let patientDayGroups = 0;
  for (const dailyRow of dailyRows) {
    const groups = validSnapshotGroups(dailyRow);
    if (!groups) continue;
    trackedDates += 1;
    patientDayGroups += groups.length;

    for (const group of groups) {
      if (!group.hasEmail) {
        addToBucket(buckets.noEmail, group.appointmentIds);
        continue;
      }

      const matchingRows = [...new Map(
        group.appointmentIds
          .flatMap((appointmentId) => outreachByAppointmentId.get(appointmentId) ?? [])
          .map((row) => [row.id, row] as const),
      ).values()];
      if (matchingRows.length === 0) {
        addToBucket(buckets.emailWithoutOutreach, group.appointmentIds);
        continue;
      }

      const successfulSentRows = matchingRows.filter(
        (row) => row.initial_sent_at && !bouncedOutreachIds.has(row.id),
      );
      if (successfulSentRows.length > 0) {
        const directlyLinkedIds = new Set(
          normalizedAppointmentIds(
            successfulSentRows.map((row) => row.crm_appointment_id),
          ),
        );
        const groupedIds = group.appointmentIds.filter((id) => !directlyLinkedIds.has(id));
        if (groupedIds.length > 0) {
          addToBucket(buckets.sentThroughSameDayGroup, groupedIds);
        }
        continue;
      }

      if (matchingRows.some((row) => row.initial_sent_at && bouncedOutreachIds.has(row.id))) {
        continue;
      }
      if (matchingRows.some((row) =>
        !row.initial_sent_at && row.failed_stage === "initial" && row.permanently_failed_at,
      )) {
        continue;
      }
      if (matchingRows.some((row) => Boolean(row.recalled_at))) {
        addToBucket(buckets.suppressedBeforeSend, group.appointmentIds);
        continue;
      }
      addToBucket(buckets.pendingNotSent, group.appointmentIds);
    }
  }

  const discrepancies: SurveyCheckoutDiscrepancies = {
    sentThroughSameDayGroup: finishBucket(buckets.sentThroughSameDayGroup),
    pendingNotSent: finishBucket(buckets.pendingNotSent),
    emailWithoutOutreach: finishBucket(buckets.emailWithoutOutreach),
    noEmail: finishBucket(buckets.noEmail),
    bounced: finishBucket(buckets.bounced),
    failedBeforeSend: finishBucket(buckets.failedBeforeSend),
    suppressedBeforeSend: finishBucket(buckets.suppressedBeforeSend),
  };
  const snapshotDates = dailyRows.length;

  return {
    ready: snapshotDates > 0 && trackedDates === snapshotDates,
    trackedDates,
    snapshotDates,
    patientDayGroups,
    noEmail: discrepancies.noEmail.groupCount,
    notSent:
      discrepancies.pendingNotSent.groupCount +
      discrepancies.emailWithoutOutreach.groupCount +
      discrepancies.suppressedBeforeSend.groupCount,
    discrepancies,
  };
}
