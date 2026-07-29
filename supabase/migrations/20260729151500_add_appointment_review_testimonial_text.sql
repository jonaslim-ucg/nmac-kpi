-- Store the testimonial supplied when a patient grants marketing permission.

alter table public.appointment_reviews
  add column if not exists testimonial_text text not null default '';

notify pgrst, 'reload schema';
