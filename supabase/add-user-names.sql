-- Run once in Supabase SQL Editor if `app_users` already exists without name columns.

alter table public.app_users add column if not exists first_name text;
alter table public.app_users add column if not exists last_name text;
