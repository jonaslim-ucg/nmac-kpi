-- Optional per-row override for the next unsent survey outreach message.

alter table public.survey_outreach
  add column if not exists manual_next_scheduled_at timestamptz;

create index if not exists survey_outreach_manual_next_scheduled_idx
  on public.survey_outreach (manual_next_scheduled_at)
  where manual_next_scheduled_at is not null;
