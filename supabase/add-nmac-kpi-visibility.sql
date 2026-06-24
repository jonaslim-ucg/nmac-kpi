-- Developer-controlled hidden NMAC KPI ids.
-- Run in Supabase SQL Editor if app_settings was created before this feature.

alter table public.app_settings
  add column if not exists hidden_nmac_kpi_ids jsonb not null default '["call_answered","call_missed","checkin_checkout","appt_confirm","sop","engage","revenue","net_margin","revenue_trend"]'::jsonb;

update public.app_settings
set hidden_nmac_kpi_ids = '["call_answered","call_missed","checkin_checkout","appt_confirm","sop","engage","revenue","net_margin","revenue_trend"]'::jsonb
where id = 'default'
  and (
    hidden_nmac_kpi_ids is null
    or jsonb_typeof(hidden_nmac_kpi_ids) <> 'array'
  );
