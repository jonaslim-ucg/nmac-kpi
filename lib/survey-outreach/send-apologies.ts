import { sendMailViaGraph } from "@/lib/graph/send-mail";
import { isSurveyApologySendingEnabled, surveyApologySendingDisabledReason } from "@/lib/survey-outreach/config";
import {
  buildSurveyApologyEmailBody,
  SURVEY_APOLOGY_SUBJECT,
  type ApologySendResult,
} from "@/lib/survey-outreach/apology-email";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type SuppressionRow = {
  id: string;
  patient_email: string;
  apology_sent_at: string | null;
};

async function patientNameForEmail(email: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("survey_outreach")
    .select("patient_name")
    .ilike("patient_email", email.trim())
    .not("initial_sent_at", "is", null)
    .order("initial_sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.patient_name ?? null;
}

export async function sendSurveyApologyEmails(options?: {
  delayMs?: number;
  dryRun?: boolean;
}): Promise<ApologySendResult> {
  if (!options?.dryRun && !isSurveyApologySendingEnabled()) {
    throw new Error(surveyApologySendingDisabledReason());
  }

  const supabase = createServiceRoleClient();
  const delayMs = options?.delayMs ?? 250;
  const dryRun = options?.dryRun ?? false;

  const { data: rows, error } = await supabase
    .from("survey_email_suppressions")
    .select("id, patient_email, apology_sent_at")
    .is("apology_sent_at", null)
    .order("patient_email", { ascending: true });

  if (error) throw new Error(error.message);

  const pending = (rows ?? []) as SuppressionRow[];
  const result: ApologySendResult = { sent: 0, skipped: 0, failed: [] };

  for (const row of pending) {
    const email = row.patient_email.trim().toLowerCase();
    if (!email) {
      result.skipped++;
      continue;
    }

    if (dryRun) {
      result.sent++;
      continue;
    }

    try {
      const patientName = await patientNameForEmail(email);
      await sendMailViaGraph({
        to: email,
        subject: SURVEY_APOLOGY_SUBJECT,
        textBody: buildSurveyApologyEmailBody(patientName),
      });

      const { error: markError } = await supabase
        .from("survey_email_suppressions")
        .update({ apology_sent_at: new Date().toISOString() })
        .eq("id", row.id);

      if (markError) throw new Error(markError.message);
      result.sent++;
    } catch (e) {
      result.failed.push({
        email,
        error: e instanceof Error ? e.message : "Send failed",
      });
    }

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return result;
}

export async function getSurveyApologyStats(): Promise<{
  pending: number;
  sent: number;
}> {
  const supabase = createServiceRoleClient();
  const { count: pending, error: pErr } = await supabase
    .from("survey_email_suppressions")
    .select("*", { count: "exact", head: true })
    .is("apology_sent_at", null);
  const { count: sent, error: sErr } = await supabase
    .from("survey_email_suppressions")
    .select("*", { count: "exact", head: true })
    .not("apology_sent_at", "is", null);
  if (pErr) throw new Error(pErr.message);
  if (sErr) throw new Error(sErr.message);
  return { pending: pending ?? 0, sent: sent ?? 0 };
}
