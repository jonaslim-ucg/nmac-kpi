-- Add referral source question for new patients (survey Q13 when patient tenure is "New patient").
-- Run in Supabase SQL Editor if appointment_reviews already exists without these columns.

alter table public.appointment_reviews
  add column if not exists referral_sources text[] not null default '{}',
  add column if not exists referral_other text not null default '';
