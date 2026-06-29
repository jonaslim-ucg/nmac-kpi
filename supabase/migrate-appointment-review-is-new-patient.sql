-- Add explicit new-patient flag for referral-source conditional logic.
-- Run in Supabase SQL Editor if appointment_reviews already exists without this column.
-- Safe even if patient_duration has not been added yet.

alter table public.appointment_reviews
  add column if not exists is_new_patient boolean;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointment_reviews'
      and column_name = 'patient_duration'
  ) then
    update public.appointment_reviews
    set is_new_patient = coalesce(is_new_patient, patient_duration = 'new')
    where is_new_patient is null;
  else
    update public.appointment_reviews
    set is_new_patient = coalesce(is_new_patient, false)
    where is_new_patient is null;
  end if;
end $$;

alter table public.appointment_reviews
  alter column is_new_patient set not null;
