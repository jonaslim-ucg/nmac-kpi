-- Consolidate same-day checked-out appointments into one survey email chain.

alter table public.survey_outreach
  add column if not exists patient_acc_number text,
  add column if not exists outreach_group_key text,
  add column if not exists merged_into_outreach_id uuid references public.survey_outreach(id),
  add column if not exists crm_appointment_ids text[] not null default '{}',
  add column if not exists provider_names text[] not null default '{}',
  add column if not exists visit_types text[] not null default '{}';

create unique index if not exists survey_outreach_group_key_unique_idx
  on public.survey_outreach (outreach_group_key)
  where outreach_group_key is not null;

create index if not exists survey_outreach_crm_appointment_ids_idx
  on public.survey_outreach using gin (crm_appointment_ids);

update public.survey_outreach
set crm_appointment_ids = array[crm_appointment_id]
where crm_appointment_id is not null
  and cardinality(crm_appointment_ids) = 0;

create or replace function public.sync_survey_outreach_daily_groups(p_groups jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  group_key text;
  patient_account text;
  patient_email_value text;
  patient_name_value text;
  appointment_date_value date;
  appointment_at_value timestamptz;
  appointment_ids_value text[];
  provider_names_value text[];
  visit_types_value text[];
  canonical_id uuid;
  synced_count integer := 0;
  existing_count integer := 0;
begin
  if jsonb_typeof(p_groups) is distinct from 'array' then
    raise exception 'p_groups must be a JSON array';
  end if;

  for item in select value from jsonb_array_elements(p_groups)
  loop
    group_key := nullif(btrim(item->>'groupKey'), '');
    patient_account := nullif(btrim(item->>'patientAccNumber'), '');
    patient_email_value := lower(nullif(btrim(item->>'patientEmail'), ''));
    patient_name_value := nullif(btrim(item->>'patientName'), '');
    appointment_date_value := nullif(item->>'appointmentDate', '')::date;
    appointment_at_value := nullif(item->>'appointmentAt', '')::timestamptz;

    select coalesce(array_agg(distinct btrim(value)) filter (where btrim(value) <> ''), '{}'::text[])
    into appointment_ids_value
    from jsonb_array_elements_text(coalesce(item->'appointmentIds', '[]'::jsonb));

    select coalesce(array_agg(distinct btrim(value)) filter (where btrim(value) <> ''), '{}'::text[])
    into provider_names_value
    from jsonb_array_elements_text(coalesce(item->'providerNames', '[]'::jsonb));

    select coalesce(array_agg(distinct btrim(value)) filter (where btrim(value) <> ''), '{}'::text[])
    into visit_types_value
    from jsonb_array_elements_text(coalesce(item->'visitTypes', '[]'::jsonb));

    if group_key is null
      or patient_email_value is null
      or patient_name_value is null
      or appointment_date_value is null
      or appointment_at_value is null
      or cardinality(appointment_ids_value) = 0 then
      raise exception 'Daily survey outreach group is missing required data';
    end if;

    perform pg_advisory_xact_lock(hashtext(group_key));

    select id
    into canonical_id
    from public.survey_outreach
    where is_test = false
      and (
        outreach_group_key = group_key
        or crm_appointment_id = any(appointment_ids_value)
        or crm_appointment_ids && appointment_ids_value
      )
    order by
      (outreach_group_key = group_key) desc,
      (completed_at is not null) desc,
      (initial_sent_at is not null) desc,
      created_at asc
    limit 1
    for update;

    if canonical_id is null then
      insert into public.survey_outreach (
        crm_appointment_id,
        crm_appointment_ids,
        patient_acc_number,
        outreach_group_key,
        patient_email,
        patient_name,
        appointment_date,
        appointment_at,
        provider_names,
        visit_types,
        is_test,
        status
      ) values (
        appointment_ids_value[1],
        appointment_ids_value,
        patient_account,
        group_key,
        patient_email_value,
        patient_name_value,
        appointment_date_value,
        appointment_at_value,
        provider_names_value,
        visit_types_value,
        false,
        'pending'
      )
      returning id into canonical_id;
      synced_count := synced_count + 1;
    else
      update public.survey_outreach as outreach
      set patient_acc_number = coalesce(patient_account, outreach.patient_acc_number),
          outreach_group_key = group_key,
          patient_email = patient_email_value,
          patient_name = patient_name_value,
          appointment_date = appointment_date_value,
          appointment_at = greatest(outreach.appointment_at, appointment_at_value),
          merged_into_outreach_id = null,
          crm_appointment_ids = array(
            select distinct value
            from unnest(coalesce(outreach.crm_appointment_ids, '{}'::text[]) || appointment_ids_value) as value
            where btrim(value) <> ''
            order by value
          ),
          provider_names = array(
            select distinct value
            from unnest(coalesce(outreach.provider_names, '{}'::text[]) || provider_names_value) as value
            where btrim(value) <> ''
            order by value
          ),
          visit_types = array(
            select distinct value
            from unnest(coalesce(outreach.visit_types, '{}'::text[]) || visit_types_value) as value
            where btrim(value) <> ''
            order by value
          )
      where outreach.id = canonical_id;
      existing_count := existing_count + 1;
    end if;

    update public.survey_outreach
    set recalled_at = coalesce(recalled_at, now()),
        recall_reason = coalesce(recall_reason, 'Grouped with another appointment from the same patient and day.'),
        manual_next_scheduled_at = null,
        send_lock_token = null,
        send_lock_stage = null,
        send_lock_until = null,
        next_retry_at = null,
        merged_into_outreach_id = canonical_id
    where id <> canonical_id
      and is_test = false
      and completed_at is null
      and (
        outreach_group_key = group_key
        or crm_appointment_id = any(appointment_ids_value)
        or crm_appointment_ids && appointment_ids_value
      );
  end loop;

  return jsonb_build_object('synced', synced_count, 'exists', existing_count);
end;
$$;

revoke all on function public.sync_survey_outreach_daily_groups(jsonb) from public;
revoke all on function public.sync_survey_outreach_daily_groups(jsonb) from anon;
revoke all on function public.sync_survey_outreach_daily_groups(jsonb) from authenticated;
grant execute on function public.sync_survey_outreach_daily_groups(jsonb) to service_role;

create or replace function public.complete_survey_outreach_from_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_id uuid;
  completion_target_id uuid;
begin
  if new.survey_token is null then
    return new;
  end if;

  select id, coalesce(merged_into_outreach_id, id)
  into matched_id, completion_target_id
  from public.survey_outreach
  where survey_token = new.survey_token
    and lower(patient_email) = lower(new.email)
  for update;

  if matched_id is null then
    raise exception 'Survey link does not match this email address.' using errcode = '23514';
  end if;

  update public.survey_outreach
  set completed_at = coalesce(completed_at, new.created_at, now()),
      status = 'completed',
      manual_next_scheduled_at = null,
      send_lock_token = null,
      send_lock_stage = null,
      send_lock_until = null,
      next_retry_at = null,
      last_send_error = null,
      failed_stage = null,
      permanently_failed_at = null
  where id in (matched_id, completion_target_id);

  return new;
end;
$$;

revoke all on function public.complete_survey_outreach_from_review() from public;
revoke all on function public.complete_survey_outreach_from_review() from anon;
revoke all on function public.complete_survey_outreach_from_review() from authenticated;

alter table public.appointment_reviews
  add column if not exists service_types text[] not null default '{}',
  add column if not exists provider_ratings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provider_ratings) = 'object');

update public.appointment_reviews
set service_types = array[service_type]
where service_type is not null
  and cardinality(service_types) = 0;

update public.appointment_reviews
set provider_ratings = jsonb_build_object(service_type, provider_rating)
where service_type is not null
  and provider_rating is not null
  and provider_ratings = '{}'::jsonb;

notify pgrst, 'reload schema';
