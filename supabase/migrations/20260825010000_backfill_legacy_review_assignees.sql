-- Map the known legacy handler labels to their app-user identities.

with assignment_aliases(handler_label, assignee_email) as (
  values
    ('patricia marketing', 'patricia.galeza@ucg.bm'),
    ('patrica marketing', 'patricia.galeza@ucg.bm'),
    ('susete', 'sroland@nmac.bm')
)
update public.appointment_reviews as review
set
  feedback_assigned_to_email = lower(app_user.email),
  feedback_responsible_person = trim(concat_ws(' ', app_user.first_name, app_user.last_name))
from assignment_aliases as assignment_alias
join public.app_users as app_user
  on lower(app_user.email) = assignment_alias.assignee_email
where review.feedback_assigned_to_email is null
  and lower(trim(review.feedback_responsible_person)) = assignment_alias.handler_label;

notify pgrst, 'reload schema';
