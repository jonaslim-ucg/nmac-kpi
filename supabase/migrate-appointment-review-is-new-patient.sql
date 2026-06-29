-- Add explicit new-patient flag for referral-source conditional logic.
-- Run in Supabase SQL Editor if appointment_reviews already exists without this column.

alter table public.appointment_reviews
  add column if not exists is_new_patient boolean;

update public.appointment_reviews
set is_new_patient = coalesce(is_new_patient, patient_duration = 'new')
where is_new_patient is null;

alter table public.appointment_reviews
  alter column is_new_patient set not null;
