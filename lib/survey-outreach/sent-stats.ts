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

type InitialBounceIndex = {
  outreachIds: Set<string>;
  productionEmails: Set<string>;
  testEmails: Set<string>;
  unclassifiedEmails: Set<string>;
};

function indexInitialBounces(bounces: readonly InitialSurveyBounceRow[]): InitialBounceIndex {
  const index: InitialBounceIndex = {
    outreachIds: new Set<string>(),
    productionEmails: new Set<string>(),
    testEmails: new Set<string>(),
    unclassifiedEmails: new Set<string>(),
  };

  for (const bounce of bounces) {
    if (bounce.stage !== "initial") continue;
    if (bounce.outreach_id) {
      index.outreachIds.add(bounce.outreach_id);
      continue;
    }

    const email = normalizedEmail(bounce.recipient_email);
    if (!email) continue;
    if (bounce.is_test === true) index.testEmails.add(email);
    else if (bounce.is_test === false) index.productionEmails.add(email);
    else index.unclassifiedEmails.add(email);
  }

  return index;
}

function isFailedInitialSend(row: InitialSurveyRecipientRow, index: InitialBounceIndex): boolean {
  if (row.id && index.outreachIds.has(row.id)) return true;
  const email = normalizedEmail(row.patient_email);
  if (!email) return false;
  return (
    index.unclassifiedEmails.has(email) ||
    (row.is_test ? index.testEmails.has(email) : index.productionEmails.has(email))
  );
}

/** Count every initial send record while excluding known delivery failures. */
export function countSuccessfulInitialSurveySends(
  rows: readonly InitialSurveyRecipientRow[],
  bounces: readonly InitialSurveyBounceRow[] = [],
): number {
  return summarizeInitialSurveySends(rows, bounces).successful;
}

export function summarizeInitialSurveySends(
  rows: readonly InitialSurveyRecipientRow[],
  bounces: readonly InitialSurveyBounceRow[] = [],
) {
  const bounceIndex = indexInitialBounces(bounces);
  const successfulRows = rows.filter((row) => !isFailedInitialSend(row, bounceIndex));
  const successfulRecipients = new Set<string>();

  successfulRows.forEach((row, index) => {
    const email = normalizedEmail(row.patient_email);
    successfulRecipients.add(
      email
        ? `${row.is_test ? "test" : "production"}:${email}`
        : `row:${row.id ?? index}`,
    );
  });

  return {
    total: rows.length,
    successful: successfulRows.length,
    failed: rows.length - successfulRows.length,
    repeatSuccessful: successfulRows.length - successfulRecipients.size,
  };
}

export function summarizeUniqueInitialRecipients(
  rows: readonly InitialSurveyRecipientRow[],
  bounces: readonly InitialSurveyBounceRow[] = [],
) {
  const bounceIndex = indexInitialBounces(bounces);

  const all = new Set<string>();
  const production = new Set<string>();
  const tests = new Set<string>();

  for (const row of rows) {
    const email = normalizedEmail(row.patient_email);
    if (!email) continue;
    if (isFailedInitialSend(row, bounceIndex)) continue;

    all.add(email);
    (row.is_test ? tests : production).add(email);
  }

  return {
    total: all.size,
    production: production.size,
    tests: tests.size,
  };
}
