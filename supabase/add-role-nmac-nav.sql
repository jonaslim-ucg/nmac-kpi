-- Per-role visibility for NMAC master KPI sidebar pages.
-- Example: { "viewer": ["overview", "visits"], "editor": ["overview", "visits", "finance"] }
-- Missing role key or empty array = that role sees all Master KPI pages.

alter table public.app_settings
  add column if not exists role_nmac_nav jsonb not null default '{}'::jsonb;
