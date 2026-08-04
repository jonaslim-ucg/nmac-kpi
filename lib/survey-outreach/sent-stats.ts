export type InitialSurveyRecipientRow = {
  id?: string | null;
  patient_email: string | null;
  is_test: boolean;
};

export type InitialSurveyBounceRow = {
  outreach_id: string | null;
  recipient_email: string | null;
  stage: string | null;
  is_test: boolean | null;
};

function normalizedEmail(value: string | null): string | null {
  const email = value?.trim().toLowerCase();
  return email || null;
}

export function summarizeUniqueInitialRecipients(
  rows: readonly InitialSurveyRecipientRow[],
  bounces: readonly InitialSurveyBounceRow[] = [],
) {
  const bouncedOutreachIds = new Set<string>();
  const unmatchedProductionEmails = new Set<string>();
  const unmatchedTestEmails = new Set<string>();
  const unmatchedUnclassifiedEmails = new Set<string>();

  for (const bounce of bounces) {
    if (bounce.stage !== "initial") continue;
    if (bounce.outreach_id) {
      bouncedOutreachIds.add(bounce.outreach_id);
      continue;
    }

    const email = normalizedEmail(bounce.recipient_email);
    if (!email) continue;
    if (bounce.is_test === true) unmatchedTestEmails.add(email);
    else if (bounce.is_test === false) unmatchedProductionEmails.add(email);
    else unmatchedUnclassifiedEmails.add(email);
  }

  const all = new Set<string>();
  const production = new Set<string>();
  const tests = new Set<string>();

  for (const row of rows) {
    const email = normalizedEmail(row.patient_email);
    if (!email) continue;
    const bounced =
      Boolean(row.id && bouncedOutreachIds.has(row.id)) ||
      unmatchedUnclassifiedEmails.has(email) ||
      (row.is_test ? unmatchedTestEmails.has(email) : unmatchedProductionEmails.has(email));
    if (bounced) continue;

    all.add(email);
    (row.is_test ? tests : production).add(email);
  }

  return {
    total: all.size,
    production: production.size,
    tests: tests.size,
  };
}
