-- Developer-controlled hidden NMAC KPI ids.

alter table public.app_settings
  add column if not exists hidden_nmac_kpi_ids jsonb not null default '["call_answered","call_missed","leakage","eod","checkin_checkout","appt_confirm","sop","engage","revenue","net_margin","revenue_trend"]'::jsonb;

update public.app_settings
set hidden_nmac_kpi_ids = '["call_answered","call_missed","leakage","eod","checkin_checkout","appt_confirm","sop","engage","revenue","net_margin","revenue_trend"]'::jsonb
where id = 'default'
  and (
    hidden_nmac_kpi_ids is null
    or jsonb_typeof(hidden_nmac_kpi_ids) <> 'array'
  );

update public.app_settings
set hidden_nmac_kpi_ids = hidden_nmac_kpi_ids || '["leakage"]'::jsonb
where id = 'default'
  and not hidden_nmac_kpi_ids @> '["leakage"]'::jsonb;

update public.app_settings
set hidden_nmac_kpi_ids = hidden_nmac_kpi_ids || '["eod"]'::jsonb
where id = 'default'
  and not hidden_nmac_kpi_ids @> '["eod"]'::jsonb;
