-- Reliability metadata, retry backoff, scheduler health, and atomic review completion.

alter table public.survey_outreach
  add column if not exists last_delivery_key uuid,
  add column if not exists send_attempt_count integer not null default 0,
  add column if not exists last_send_attempt_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_send_error text,
  add column if not exists failed_stage text,
  add column if not exists permanently_failed_at timestamptz;

alter table public.survey_outreach
  drop constraint if exists survey_outreach_status_check;

alter table public.survey_outreach
  add constraint survey_outreach_status_check
  check (status in ('pending', 'sent', 'completed', 'skipped', 'failed'));

alter table public.survey_outreach
  drop constraint if exists survey_outreach_send_attempt_count_check;

alter table public.survey_outreach
  add constraint survey_outreach_send_attempt_count_check
  check (send_attempt_count >= 0);

alter table public.survey_outreach
  drop constraint if exists survey_outreach_failed_stage_check;

alter table public.survey_outreach
  add constraint survey_outreach_failed_stage_check
  check (failed_stage is null or failed_stage in ('initial', 'reminder1', 'reminder2', 'final'));

alter table public.survey_outreach
  drop constraint if exists survey_outreach_send_lock_stage_check;

alter table public.survey_outreach
  add constraint survey_outreach_send_lock_stage_check
  check (send_lock_stage is null or send_lock_stage in ('initial', 'reminder1', 'reminder2', 'final'));

create index if not exists survey_outreach_retry_due_idx
  on public.survey_outreach (next_retry_at, appointment_at)
  where completed_at is null
    and recalled_at is null
    and permanently_failed_at is null
    and final_sent_at is null;

create or replace function public.sync_survey_outreach_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.completed_at is not null then
    new.status := 'completed';
  elsif new.permanently_failed_at is not null then
    new.status := 'failed';
  elsif new.recalled_at is not null then
    new.status := 'skipped';
  elsif new.initial_sent_at is not null
     or new.reminder_1_sent_at is not null
     or new.reminder_2_sent_at is not null
     or new.final_sent_at is not null then
    new.status := 'sent';
  else
    new.status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists survey_outreach_sync_status on public.survey_outreach;
create trigger survey_outreach_sync_status
before insert or update on public.survey_outreach
for each row execute function public.sync_survey_outreach_status();

alter table public.app_settings
  add column if not exists survey_outreach_last_run_at timestamptz,
  add column if not exists survey_outreach_last_success_at timestamptz,
  add column if not exists survey_outreach_last_error text,
  add column if not exists survey_outreach_last_result jsonb;

alter table public.appointment_reviews
  add column if not exists survey_token uuid;

create unique index if not exists appointment_reviews_survey_token_unique_idx
  on public.appointment_reviews (survey_token)
  where survey_token is not null;

create or replace function public.complete_survey_outreach_from_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_id uuid;
begin
  if new.survey_token is null then
    return new;
  end if;

  update public.survey_outreach
  set completed_at = coalesce(completed_at, new.created_at, now()),
      status = 'completed',
      manual_next_scheduled_at = null,
      send_lock_token = null,
      send_lock_stage = null,
      send_lock_until = null,
      next_retry_at = null,
      last_send_error = null,
      failed_stage = null,
      permanently_failed_at = null
  where survey_token = new.survey_token
    and lower(patient_email) = lower(new.email)
  returning id into matched_id;

  if matched_id is null then
    raise exception 'Survey link does not match this email address.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists appointment_review_complete_outreach on public.appointment_reviews;
create trigger appointment_review_complete_outreach
after insert on public.appointment_reviews
for each row execute function public.complete_survey_outreach_from_review();

revoke all on function public.complete_survey_outreach_from_review() from public;
