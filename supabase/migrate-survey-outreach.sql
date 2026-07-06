-- Tracks post-visit survey emails (initial + reminders) per appointment.

create table if not exists public.survey_outreach (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  survey_token uuid not null unique default gen_random_uuid(),
  crm_appointment_id text unique,
  patient_email text not null,
  patient_name text not null,
  appointment_date date,
  appointment_at timestamptz,
  is_test boolean not null default false,
  initial_sent_at timestamptz,
  reminder_1_sent_at timestamptz,
  reminder_2_sent_at timestamptz,
  final_sent_at timestamptz,
  completed_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sent', 'completed', 'skipped'))
);

create index if not exists survey_outreach_email_idx on public.survey_outreach (lower(patient_email));
create index if not exists survey_outreach_pending_idx on public.survey_outreach (completed_at, initial_sent_at);

alter table public.survey_outreach enable row level security;
