-- Cache privacy-light patient-day checkout groups for delivery reconciliation.

alter table public.survey_outreach_daily_checkouts
  add column if not exists distinct_patient_count integer check (distinct_patient_count >= 0),
  add column if not exists eligible_survey_count integer check (eligible_survey_count >= 0),
  add column if not exists no_email_count integer check (no_email_count >= 0),
  add column if not exists survey_groups jsonb;

comment on column public.survey_outreach_daily_checkouts.survey_groups is
  'Patient-day groups containing only CRM appointment IDs and whether any appointment had an email.';
