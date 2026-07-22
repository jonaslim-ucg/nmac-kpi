-- Preserve the CRM appointment -> provider relationship for provider-volume reporting.

alter table public.survey_outreach
  add column if not exists appointment_providers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(appointment_providers) = 'object');

create or replace function public.merge_survey_outreach_appointment_providers(p_groups jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  group_key text;
  appointment_providers_value jsonb;
  updated_count integer := 0;
begin
  if jsonb_typeof(p_groups) is distinct from 'array' then
    raise exception 'p_groups must be a JSON array';
  end if;

  for item in select value from jsonb_array_elements(p_groups)
  loop
    group_key := nullif(btrim(item->>'groupKey'), '');
    appointment_providers_value := coalesce(item->'appointmentProviders', '{}'::jsonb);

    if group_key is null or jsonb_typeof(appointment_providers_value) is distinct from 'object' then
      raise exception 'Survey outreach provider mapping is invalid';
    end if;

    update public.survey_outreach
    set appointment_providers = coalesce(appointment_providers, '{}'::jsonb) || appointment_providers_value
    where outreach_group_key = group_key
      and merged_into_outreach_id is null;

    if found then
      updated_count := updated_count + 1;
    end if;
  end loop;

  return updated_count;
end;
$$;

revoke all on function public.merge_survey_outreach_appointment_providers(jsonb) from public;
revoke all on function public.merge_survey_outreach_appointment_providers(jsonb) from anon;
revoke all on function public.merge_survey_outreach_appointment_providers(jsonb) from authenticated;
grant execute on function public.merge_survey_outreach_appointment_providers(jsonb) to service_role;

notify pgrst, 'reload schema';
