-- Suppress survey emails to specific addresses (e.g. after accidental mass send).

alter table public.survey_outreach
  add column if not exists recalled_at timestamptz,
  add column if not exists recall_reason text;

create table if not exists public.survey_email_suppressions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  patient_email text not null,
  reason text not null,
  constraint survey_email_suppressions_email_unique unique (patient_email)
);

create index if not exists survey_email_suppressions_email_idx
  on public.survey_email_suppressions (lower(patient_email));

alter table public.survey_email_suppressions enable row level security;
