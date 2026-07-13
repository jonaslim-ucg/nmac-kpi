-- Organization-wide dashboard settings (one row for the whole workspace).

create table if not exists public.app_settings (
  id text primary key,
  hide_legacy_nav boolean not null default false,
  use_nmac_test_data boolean not null default true,
  survey_outreach_sending_enabled boolean not null default false,
  survey_outreach_sending_enabled_at timestamptz,
  nmac_month_cache_revision bigint not null default 0,
  hidden_nmac_kpi_ids jsonb not null default '["call_answered","call_missed","checkin_checkout","appt_confirm","sop","engage","revenue","net_margin","revenue_trend"]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 'default')
);

alter table public.app_settings
  add column if not exists hidden_nmac_kpi_ids jsonb not null default '["call_answered","call_missed","checkin_checkout","appt_confirm","sop","engage","revenue","net_margin","revenue_trend"]'::jsonb;

alter table public.app_settings
  add column if not exists survey_outreach_sending_enabled boolean not null default false;

alter table public.app_settings
  add column if not exists survey_outreach_sending_enabled_at timestamptz;

insert into public.app_settings (id)
values ('default')
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- One-time: if per-user columns exist from an older migration, fold them into the org row.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_users'
      and column_name = 'hide_legacy_nav'
  ) then
    update public.app_settings s
    set
      hide_legacy_nav = coalesce((select bool_or(hide_legacy_nav) from public.app_users), s.hide_legacy_nav),
      use_nmac_test_data = coalesce((select bool_and(use_nmac_test_data) from public.app_users), s.use_nmac_test_data),
      nmac_month_cache_revision = coalesce((select max(nmac_month_cache_revision) from public.app_users), s.nmac_month_cache_revision),
      updated_at = now()
    where s.id = 'default';
  end if;
end $$;
