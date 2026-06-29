-- Add patient email and name as the first two survey questions.
-- Run in Supabase SQL Editor if appointment_reviews already exists without these columns.

alter table public.appointment_reviews
  add column if not exists email text,
  add column if not exists patient_name text;

update public.appointment_reviews
set
  email = coalesce(email, 'unknown@example.com'),
  patient_name = coalesce(patient_name, 'Unknown')
where email is null or patient_name is null;

alter table public.appointment_reviews
  alter column email set not null,
  alter column patient_name set not null;
