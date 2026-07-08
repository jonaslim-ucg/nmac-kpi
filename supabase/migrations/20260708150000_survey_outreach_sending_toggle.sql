-- Survey outreach live sending toggle. Defaults off so deployments never start
-- production survey emails until an admin explicitly enables them in-app.

alter table public.app_settings
  add column if not exists survey_outreach_sending_enabled boolean not null default false;
