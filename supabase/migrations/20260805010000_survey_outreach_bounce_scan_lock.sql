-- Prevent overlapping cron runs from scanning the Outlook mailbox concurrently.

alter table public.app_settings
  add column if not exists survey_outreach_bounce_lock_token uuid,
  add column if not exists survey_outreach_bounce_lock_until timestamptz;
