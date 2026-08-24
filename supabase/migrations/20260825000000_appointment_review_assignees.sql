-- Link feedback assignments to app users so assigned-review access can be enforced by email.

alter table public.appointment_reviews
  add column if not exists feedback_assigned_to_email text;

update public.appointment_reviews as review
set feedback_assigned_to_email = lower(app_user.email)
from public.app_users as app_user
where nullif(trim(review.feedback_responsible_person), '') is not null
  and review.feedback_assigned_to_email is null
  and (
    lower(trim(review.feedback_responsible_person)) = lower(app_user.email)
    or lower(trim(review.feedback_responsible_person)) = lower(
      trim(concat_ws(' ', app_user.first_name, app_user.last_name))
    )
  );

create index if not exists appointment_reviews_feedback_assigned_to_email_idx
  on public.appointment_reviews (lower(feedback_assigned_to_email))
  where feedback_assigned_to_email is not null;

notify pgrst, 'reload schema';
