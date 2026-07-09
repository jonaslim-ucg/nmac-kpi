-- Bring appointment_reviews up to date with the current /appointment-review survey.
-- Safe to re-run: uses IF NOT EXISTS / conditional alters.

create table if not exists public.appointment_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text,
  patient_name text,
  appointment_ease smallint not null check (appointment_ease between 1 and 5),
  visit_rating smallint not null check (visit_rating between 1 and 5),
  provider_and_services text,
  service_type text,
  service_type_other text not null default '',
  provider_rating smallint check (provider_rating between 1 and 5),
  health_improvement text not null default '',
  health_rating smallint check (health_rating between 1 and 5),
  confidence_rating smallint check (confidence_rating between 1 and 5),
  quality_of_life_rating smallint check (quality_of_life_rating between 1 and 5),
  recommendation_message text not null default '',
  recommendation_rating smallint check (recommendation_rating between 1 and 5),
  would_encourage_patient boolean,
  testimonial_permission text,
  wait_time text,
  provider_time_adequate boolean,
  provider_time_comment text not null default '',
  front_desk_rating smallint,
  is_new_patient boolean,
  patient_duration text,
  referral_sources text[] not null default '{}',
  referral_other text not null default '',
  exceptional_staff_comment text not null default ''
);

alter table public.appointment_reviews
  add column if not exists email text,
  add column if not exists patient_name text,
  add column if not exists provider_and_services text,
  add column if not exists health_improvement text not null default '',
  add column if not exists recommendation_message text not null default '',
  add column if not exists testimonial_permission text,
  add column if not exists wait_time text,
  add column if not exists provider_time_adequate boolean,
  add column if not exists provider_time_comment text not null default '',
  add column if not exists front_desk_rating smallint,
  add column if not exists is_new_patient boolean,
  add column if not exists patient_duration text,
  add column if not exists referral_sources text[] not null default '{}',
  add column if not exists referral_other text not null default '',
  add column if not exists exceptional_staff_comment text not null default '';

update public.appointment_reviews
set
  email = coalesce(email, 'unknown@example.com'),
  patient_name = coalesce(patient_name, 'Unknown'),
  provider_and_services = coalesce(provider_and_services, ''),
  testimonial_permission = coalesce(testimonial_permission, 'confidential'),
  wait_time = coalesce(wait_time, '0-5'),
  provider_time_adequate = coalesce(provider_time_adequate, true),
  front_desk_rating = coalesce(front_desk_rating, 3),
  is_new_patient = coalesce(is_new_patient, patient_duration = 'new', false),
  patient_duration = coalesce(patient_duration, case when is_new_patient then 'new' else 'less-1' end)
where email is null
   or patient_name is null
   or provider_and_services is null
   or testimonial_permission is null
   or wait_time is null
   or provider_time_adequate is null
   or front_desk_rating is null
   or is_new_patient is null
   or patient_duration is null;

alter table public.appointment_reviews
  alter column email set not null,
  alter column patient_name set not null,
  alter column provider_and_services set not null,
  alter column testimonial_permission set not null,
  alter column wait_time set not null,
  alter column provider_time_adequate set not null,
  alter column front_desk_rating set not null,
  alter column is_new_patient set not null,
  alter column patient_duration set not null;

alter table public.appointment_reviews
  drop constraint if exists appointment_reviews_testimonial_permission_check;

alter table public.appointment_reviews
  add constraint appointment_reviews_testimonial_permission_check
  check (testimonial_permission in ('yes-named', 'yes-anonymous', 'confidential'));

alter table public.appointment_reviews
  drop constraint if exists appointment_reviews_wait_time_check;

alter table public.appointment_reviews
  add constraint appointment_reviews_wait_time_check
  check (wait_time in ('0-5', '10-15', '20-30', 'over-30'));

alter table public.appointment_reviews
  drop constraint if exists appointment_reviews_front_desk_rating_check;

alter table public.appointment_reviews
  add constraint appointment_reviews_front_desk_rating_check
  check (front_desk_rating between 1 and 5);

alter table public.appointment_reviews
  drop constraint if exists appointment_reviews_patient_duration_check;

alter table public.appointment_reviews
  add constraint appointment_reviews_patient_duration_check
  check (patient_duration in ('new', 'less-1', '1-4', '5-9', '10-plus'));

alter table public.appointment_reviews enable row level security;

notify pgrst, 'reload schema';
