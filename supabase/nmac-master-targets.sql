-- Optional add-on: NMAC master target overrides per year (run if schema.sql was applied before this table existed).

create table if not exists public.nmac_master_targets (
  year int primary key,
  values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.nmac_master_targets enable row level security;

drop policy if exists "nmac_master_targets_read" on public.nmac_master_targets;
create policy "nmac_master_targets_read"
on public.nmac_master_targets
for select
using (true);

drop policy if exists "nmac_master_targets_write" on public.nmac_master_targets;
create policy "nmac_master_targets_write"
on public.nmac_master_targets
for all
using (true)
with check (true);
