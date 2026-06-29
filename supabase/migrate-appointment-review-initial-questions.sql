-- Add initial survey questions retained from the original appointment review form (Q7–11).
-- Run in Supabase SQL Editor if appointment_reviews already exists without these columns.

alter table public.appointment_reviews
  add column if not exists wait_time text,
  add column if not exists provider_time_adequate boolean,
  add column if not exists provider_time_comment text not null default '',
  add column if not exists front_desk_rating smallint,
  add column if not exists patient_duration text,
  add column if not exists exceptional_staff_comment text not null default '';

update public.appointment_reviews
set
  wait_time = coalesce(wait_time, '0-5'),
  provider_time_adequate = coalesce(provider_time_adequate, true),
  front_desk_rating = coalesce(front_desk_rating, 3),
  patient_duration = coalesce(patient_duration, 'new')
where wait_time is null
   or provider_time_adequate is null
   or front_desk_rating is null
   or patient_duration is null;

alter table public.appointment_reviews
  alter column wait_time set not null,
  alter column provider_time_adequate set not null,
  alter column front_desk_rating set not null,
  alter column patient_duration set not null;

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
