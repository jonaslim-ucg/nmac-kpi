-- Structured/scaled questions for provider, care outcomes, and recommendation (Q5–13)

alter table public.appointment_reviews
  add column if not exists service_type text,
  add column if not exists service_type_other text not null default '',
  add column if not exists provider_rating smallint check (provider_rating between 1 and 5),
  add column if not exists health_rating smallint check (health_rating between 1 and 5),
  add column if not exists confidence_rating smallint check (confidence_rating between 1 and 5),
  add column if not exists quality_of_life_rating smallint check (quality_of_life_rating between 1 and 5),
  add column if not exists recommendation_rating smallint check (recommendation_rating between 1 and 5),
  add column if not exists would_encourage_patient boolean;

alter table public.appointment_reviews
  alter column provider_and_services set default '';
