alter table public.survey_email_suppressions
  add column if not exists apology_sent_at timestamptz;
