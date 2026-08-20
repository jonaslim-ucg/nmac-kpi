-- Staff-only workflow fields for handling patient survey feedback.

alter table public.appointment_reviews
  add column if not exists feedback_responsible_person text not null default '',
  add column if not exists feedback_status text not null default 'needs_review',
  add column if not exists feedback_notes text not null default '',
  add column if not exists feedback_updated_at timestamptz,
  add column if not exists feedback_updated_by text;

alter table public.appointment_reviews
  drop constraint if exists appointment_reviews_feedback_status_check;

alter table public.appointment_reviews
  add constraint appointment_reviews_feedback_status_check
  check (feedback_status in ('needs_review', 'in_progress', 'actioned', 'no_action_needed'));

notify pgrst, 'reload schema';
