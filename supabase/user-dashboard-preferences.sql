-- Run once in Supabase SQL Editor to sync dashboard settings per user account.

alter table public.app_users
  add column if not exists hide_legacy_nav boolean not null default false;

alter table public.app_users
  add column if not exists use_nmac_test_data boolean not null default true;

/** Bumped when the user clears NMAC month browser cache so other devices drop stale local snapshots. */
alter table public.app_users
  add column if not exists nmac_month_cache_revision bigint not null default 0;
