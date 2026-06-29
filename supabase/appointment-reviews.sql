-- Patient appointment review submissions (public form at /appointment-review)

create table if not exists public.appointment_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  patient_name text not null,
  appointment_ease smallint not null check (appointment_ease between 1 and 5),
  visit_rating smallint not null check (visit_rating between 1 and 5),
  provider_and_services text not null,
  health_improvement text not null default '',
  recommendation_message text not null default '',
  testimonial_permission text not null check (testimonial_permission in ('yes-named', 'yes-anonymous', 'confidential')),
  wait_time text not null check (wait_time in ('0-5', '10-15', '20-30', 'over-30')),
  provider_time_adequate boolean not null,
  provider_time_comment text not null default '',
  front_desk_rating smallint not null check (front_desk_rating between 1 and 5),
  patient_duration text not null check (patient_duration in ('new', 'less-1', '1-4', '5-9', '10-plus')),
  exceptional_staff_comment text not null default ''
);

alter table public.appointment_reviews enable row level security;
