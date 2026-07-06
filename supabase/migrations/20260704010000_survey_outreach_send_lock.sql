-- Short-lived lock so overlapping scheduler runs do not send the same stage twice.

alter table public.survey_outreach
  add column if not exists send_lock_token uuid,
  add column if not exists send_lock_stage text,
  add column if not exists send_lock_until timestamptz;

create index if not exists survey_outreach_send_lock_idx
  on public.survey_outreach (send_lock_until)
  where send_lock_until is not null;
