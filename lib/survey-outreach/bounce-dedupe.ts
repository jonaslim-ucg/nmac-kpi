export type SurveyBounceIdentityRow = {
  graph_message_id: string;
  recipient_email: string | null;
  outreach_id: string | null;
  is_test: boolean | null;
  hard_bounce: boolean;
};

function bounceIdentity(row: SurveyBounceIdentityRow): string {
  const email = row.recipient_email?.trim().toLowerCase();
  if (email) return `email:${email}`;
  if (row.outreach_id) return `outreach:${row.outreach_id}`;
  return `message:${row.graph_message_id}`;
}

export function uniqueSurveyBounceRows<T extends SurveyBounceIdentityRow>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const identity = bounceIdentity(row);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function summarizeUniqueSurveyBounces(rows: readonly SurveyBounceIdentityRow[]) {
  const recipients = new Map<string, {
    production: boolean;
    tests: boolean;
    matched: boolean;
    hard: boolean;
  }>();

  for (const row of rows) {
    const identity = bounceIdentity(row);
    const summary = recipients.get(identity) ?? {
      production: false,
      tests: false,
      matched: false,
      hard: false,
    };
    summary.production ||= row.is_test === false;
    summary.tests ||= row.is_test === true;
    summary.matched ||= Boolean(row.outreach_id);
    summary.hard ||= row.hard_bounce;
    recipients.set(identity, summary);
  }

  const values = [...recipients.values()];
  return {
    total: values.length,
    production: values.filter((row) => row.production).length,
    tests: values.filter((row) => row.tests).length,
    unmatched: values.filter((row) => !row.matched).length,
    hard: values.filter((row) => row.hard).length,
  };
}
