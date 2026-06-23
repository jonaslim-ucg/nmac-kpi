-- Patient appointment review submissions (public form at /appointment-review)

create table if not exists public.appointment_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  appointment_ease smallint not null check (appointment_ease between 1 and 5),
  wait_time text not null,
  visit_rating smallint not null check (visit_rating between 1 and 5),
  provider_time_adequate boolean not null,
  provider_time_comment text not null default '',
  understand_diagnosis boolean not null,
  clinical_care_rating smallint not null check (clinical_care_rating between 1 and 5),
  clinical_care_comment text not null default '',
  front_desk_rating smallint not null check (front_desk_rating between 1 and 5),
  is_patient boolean not null,
  patient_duration text not null,
  exceptional_staff_comment text not null default '',
  improvement_staff_comment text not null default '',
  recommend_likelihood smallint not null check (recommend_likelihood between 1 and 5)
);

alter table public.appointment_reviews enable row level security;
