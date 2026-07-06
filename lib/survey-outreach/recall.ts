import { createServiceRoleClient } from "@/lib/supabase/admin";

export type RecallProductionResult = {
  rowsRecalled: number;
  emailsSuppressed: number;
  reason: string;
};

export async function isSurveyEmailSuppressed(email: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from("survey_email_suppressions")
    .select("id")
    .ilike("patient_email", normalized)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** Stop all future survey emails and mark existing production outreach as recalled. */
export async function recallAllProductionSurveyOutreach(
  reason = "Recalled after accidental send before go-live.",
): Promise<RecallProductionResult> {
  const supabase = createServiceRoleClient();

  const { data: sentRows, error: sentError } = await supabase
    .from("survey_outreach")
    .select("patient_email")
    .eq("is_test", false)
    .not("initial_sent_at", "is", null);

  if (sentError) throw new Error(sentError.message);

  const emails = [...new Set((sentRows ?? []).map((r) => String(r.patient_email).trim().toLowerCase()))];
  if (emails.length === 0) {
    return { rowsRecalled: 0, emailsSuppressed: 0, reason };
  }

  const suppressPayload = emails.map((patient_email) => ({ patient_email, reason }));
  const { error: suppressError } = await supabase
    .from("survey_email_suppressions")
    .upsert(suppressPayload, { onConflict: "patient_email" });

  if (suppressError) throw new Error(suppressError.message);

  const now = new Date().toISOString();
  const { data: recalled, error: recallError } = await supabase
    .from("survey_outreach")
    .update({
      status: "skipped",
      recalled_at: now,
      recall_reason: reason,
    })
    .eq("is_test", false)
    .is("recalled_at", null)
    .in("patient_email", emails)
    .select("id");

  if (recallError) throw new Error(recallError.message);

  return {
    rowsRecalled: recalled?.length ?? 0,
    emailsSuppressed: emails.length,
    reason,
  };
}

export async function getSurveySuppressionStats(): Promise<{
  suppressedEmails: number;
  recalledRows: number;
}> {
  const supabase = createServiceRoleClient();
  const { count: suppressedEmails, error: sErr } = await supabase
    .from("survey_email_suppressions")
    .select("*", { count: "exact", head: true });
  const { count: recalledRows, error: rErr } = await supabase
    .from("survey_outreach")
    .select("*", { count: "exact", head: true })
    .not("recalled_at", "is", null);
  if (sErr) throw new Error(sErr.message);
  if (rErr) throw new Error(rErr.message);
  return {
    suppressedEmails: suppressedEmails ?? 0,
    recalledRows: recalledRows ?? 0,
  };
}
