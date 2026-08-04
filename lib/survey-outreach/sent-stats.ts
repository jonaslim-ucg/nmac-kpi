export type InitialSurveyRecipientRow = {
  patient_email: string | null;
  is_test: boolean;
};

export function summarizeUniqueInitialRecipients(rows: readonly InitialSurveyRecipientRow[]) {
  const all = new Set<string>();
  const production = new Set<string>();
  const tests = new Set<string>();

  for (const row of rows) {
    const email = row.patient_email?.trim().toLowerCase();
    if (!email) continue;
    all.add(email);
    (row.is_test ? tests : production).add(email);
  }

  return {
    total: all.size,
    production: production.size,
    tests: tests.size,
  };
}
