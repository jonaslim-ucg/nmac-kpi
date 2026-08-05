-- Cache daily CRM checked-out appointment totals for survey reporting.

create table if not exists public.survey_outreach_daily_checkouts (
  appointment_date date primary key,
  checkout_count integer not null check (checkout_count >= 0),
  synced_at timestamptz not null default now()
);

alter table public.survey_outreach_daily_checkouts enable row level security;
