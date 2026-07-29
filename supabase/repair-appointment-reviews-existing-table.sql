-- Repair an existing appointment_reviews table that is missing current survey columns.
-- Safe to re-run in Supabase SQL Editor.

alter table public.appointment_reviews
  add column if not exists email text,
  add column if not exists patient_name text,
  add column if not exists appointment_ease smallint,
  add column if not exists visit_rating smallint,
  add column if not exists provider_and_services text not null default '',
  add column if not exists service_type text,
  add column if not exists service_types text[] not null default '{}',
  add column if not exists service_type_other text not null default '',
  add column if not exists provider_rating smallint,
  add column if not exists provider_ratings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provider_ratings) = 'object'),
  add column if not exists health_improvement text not null default '',
  add column if not exists health_rating smallint,
  add column if not exists confidence_rating smallint,
  add column if not exists quality_of_life_rating smallint,
  add column if not exists recommendation_message text not null default '',
  add column if not exists recommendation_rating smallint,
  add column if not exists would_encourage_patient boolean,
  add column if not exists testimonial_permission text,
  add column if not exists testimonial_text text not null default '',
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
set service_types = array[service_type]
where service_type is not null
  and cardinality(service_types) = 0;

update public.appointment_reviews
set provider_ratings = jsonb_build_object(service_type, provider_rating)
where service_type is not null
  and provider_rating is not null
  and provider_ratings = '{}'::jsonb;

notify pgrst, 'reload schema';
