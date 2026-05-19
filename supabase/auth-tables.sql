-- Run this in Supabase SQL Editor if `app_users` does not exist yet
-- (e.g. you ran KPI schema before auth tables were added).

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  first_name text,
  last_name text,
  role text not null check (role in ('viewer', 'editor', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_otp_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.app_users enable row level security;
alter table public.auth_otp_codes enable row level security;

-- If this file was run on an older DB without name columns, run add-user-names.sql too.
alter table public.app_users add column if not exists first_name text;
alter table public.app_users add column if not exists last_name text;

alter table public.app_users add column if not exists hide_legacy_nav boolean not null default false;
alter table public.app_users add column if not exists use_nmac_test_data boolean not null default true;
alter table public.app_users add column if not exists nmac_month_cache_revision bigint not null default 0;
