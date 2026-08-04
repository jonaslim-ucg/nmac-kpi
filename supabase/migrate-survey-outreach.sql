-- Tracks post-visit survey emails (initial + reminders) per appointment.

create table if not exists public.survey_outreach (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  survey_token uuid not null unique default gen_random_uuid(),
  crm_appointment_id text unique,
  patient_email text not null,
  patient_name text not null,
  appointment_date date,
  appointment_at timestamptz,
  is_test boolean not null default false,
  initial_sent_at timestamptz,
  reminder_1_sent_at timestamptz,
  reminder_2_sent_at timestamptz,
  final_sent_at timestamptz,
  completed_at timestamptz,
  manual_next_scheduled_at timestamptz,
  send_lock_token uuid,
  send_lock_stage text check (send_lock_stage is null or send_lock_stage in ('initial', 'reminder1', 'reminder2', 'final')),
  send_lock_until timestamptz,
  last_delivery_key uuid,
  send_attempt_count integer not null default 0 check (send_attempt_count >= 0),
  last_send_attempt_at timestamptz,
  next_retry_at timestamptz,
  last_send_error text,
  failed_stage text check (failed_stage is null or failed_stage in ('initial', 'reminder1', 'reminder2', 'final')),
  permanently_failed_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sent', 'completed', 'skipped', 'failed')),
  recalled_at timestamptz,
  recall_reason text
);

create index if not exists survey_outreach_email_idx on public.survey_outreach (lower(patient_email));
create index if not exists survey_outreach_pending_idx on public.survey_outreach (completed_at, initial_sent_at);
create index if not exists survey_outreach_manual_next_scheduled_idx
  on public.survey_outreach (manual_next_scheduled_at)
  where manual_next_scheduled_at is not null;
create index if not exists survey_outreach_send_lock_idx
  on public.survey_outreach (send_lock_until)
  where send_lock_until is not null;
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

alter table public.survey_outreach enable row level security;

-- Outlook can accept a send and report an invalid recipient later. Store those
-- non-delivery reports independently from immediate Graph API failures.
create table if not exists public.survey_outreach_bounces (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  graph_message_id text not null unique,
  graph_sent_message_id text,
  original_internet_message_id text,
  delivery_key uuid,
  outreach_id uuid references public.survey_outreach(id) on delete set null,
  recipient_email text,
  original_subject text not null default '',
  stage text check (stage is null or stage in ('initial', 'reminder1', 'reminder2', 'final')),
  is_test boolean,
  received_at timestamptz not null,
  status_code text,
  reason text not null default '',
  diagnostic text not null default '',
  hard_bounce boolean not null default false
);

create index if not exists survey_outreach_bounces_received_at_idx
  on public.survey_outreach_bounces (received_at desc);

create index if not exists survey_outreach_bounces_outreach_id_idx
  on public.survey_outreach_bounces (outreach_id)
  where outreach_id is not null;

create index if not exists survey_outreach_bounces_delivery_key_idx
  on public.survey_outreach_bounces (delivery_key)
  where delivery_key is not null;

create index if not exists survey_outreach_bounces_recipient_email_idx
  on public.survey_outreach_bounces (lower(recipient_email))
  where recipient_email is not null;

alter table public.survey_outreach_bounces enable row level security;

alter table public.app_settings
  add column if not exists survey_outreach_bounce_last_checked_at timestamptz,
  add column if not exists survey_outreach_bounce_last_success_at timestamptz,
  add column if not exists survey_outreach_bounce_last_error text,
  add column if not exists survey_outreach_bounce_last_result jsonb;
