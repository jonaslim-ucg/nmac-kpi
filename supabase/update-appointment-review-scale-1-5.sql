-- Update existing appointment review rating checks from 1-10 to 1-5.
-- Run in Supabase SQL Editor if the appointment_reviews table already exists.

alter table public.appointment_reviews
  drop constraint if exists appointment_reviews_appointment_ease_check,
  add constraint appointment_reviews_appointment_ease_check check (appointment_ease between 1 and 5) not valid;

alter table public.appointment_reviews
  drop constraint if exists appointment_reviews_visit_rating_check,
  add constraint appointment_reviews_visit_rating_check check (visit_rating between 1 and 5) not valid;

alter table public.appointment_reviews
  drop constraint if exists appointment_reviews_clinical_care_rating_check,
  add constraint appointment_reviews_clinical_care_rating_check check (clinical_care_rating between 1 and 5) not valid;

alter table public.appointment_reviews
  drop constraint if exists appointment_reviews_front_desk_rating_check,
  add constraint appointment_reviews_front_desk_rating_check check (front_desk_rating between 1 and 5) not valid;

alter table public.appointment_reviews
  drop constraint if exists appointment_reviews_recommend_likelihood_check,
  add constraint appointment_reviews_recommend_likelihood_check check (recommend_likelihood between 1 and 5) not valid;
