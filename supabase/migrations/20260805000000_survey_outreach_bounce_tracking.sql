-- Track Outlook non-delivery reports separately from Graph API send failures.

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
