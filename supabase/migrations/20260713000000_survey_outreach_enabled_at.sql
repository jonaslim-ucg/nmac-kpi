-- Records when live survey sending is turned on.
-- The scheduler uses this timestamp as the go-live cutoff so older checkouts
-- are never pulled into production survey outreach.

alter table public.app_settings
  add column if not exists survey_outreach_sending_enabled_at timestamptz;

update public.app_settings
set survey_outreach_sending_enabled_at = coalesce(survey_outreach_sending_enabled_at, updated_at, now())
where id = 'default'
  and survey_outreach_sending_enabled = true
  and survey_outreach_sending_enabled_at is null;
