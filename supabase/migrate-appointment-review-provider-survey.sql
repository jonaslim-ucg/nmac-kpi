-- Migrate appointment_reviews to the NMAC Provider Experience Survey (core questions 1–5).
-- Run in Supabase SQL Editor after backing up existing data if needed.

alter table public.appointment_reviews
  drop column if exists wait_time,
  drop column if exists provider_time_adequate,
  drop column if exists provider_time_comment,
  drop column if exists understand_diagnosis,
  drop column if exists clinical_care_rating,
  drop column if exists clinical_care_comment,
  drop column if exists front_desk_rating,
  drop column if exists is_patient,
  drop column if exists patient_duration,
  drop column if exists exceptional_staff_comment,
  drop column if exists improvement_staff_comment,
  drop column if exists recommend_likelihood;

alter table public.appointment_reviews
  add column if not exists provider_and_services text,
  add column if not exists health_improvement text not null default '',
  add column if not exists recommendation_message text not null default '';

update public.appointment_reviews
set provider_and_services = coalesce(provider_and_services, '')
where provider_and_services is null;

alter table public.appointment_reviews
  alter column provider_and_services set not null;
