-- Add testimonial permission question (survey Q6).
-- Run in Supabase SQL Editor if appointment_reviews already exists without this column.

alter table public.appointment_reviews
  add column if not exists testimonial_permission text;

update public.appointment_reviews
set testimonial_permission = 'confidential'
where testimonial_permission is null;

alter table public.appointment_reviews
  alter column testimonial_permission set not null;

alter table public.appointment_reviews
  drop constraint if exists appointment_reviews_testimonial_permission_check;

alter table public.appointment_reviews
  add constraint appointment_reviews_testimonial_permission_check
  check (testimonial_permission in ('yes-named', 'yes-anonymous', 'confidential'));
