-- Patient appointment review submissions (public form at /appointment-review)

create table if not exists public.appointment_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  appointment_ease smallint not null check (appointment_ease between 1 and 5),
  visit_rating smallint not null check (visit_rating between 1 and 5),
  provider_and_services text not null,
  health_improvement text not null default '',
  recommendation_message text not null default ''
);

alter table public.appointment_reviews enable row level security;
