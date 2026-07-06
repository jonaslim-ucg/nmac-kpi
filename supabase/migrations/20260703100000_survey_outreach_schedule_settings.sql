-- Survey outreach reminder schedule (dev-configurable via app_settings).

alter table public.app_settings
  add column if not exists survey_outreach_schedule jsonb not null default '{
    "initialDelayHours": 24,
    "reminder1Days": 3,
    "reminder2Days": 7,
    "finalReminderDays": 14
  }'::jsonb;
