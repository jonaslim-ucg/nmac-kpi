-- Custom roles for Master KPI access and user assignment.

alter table public.app_settings
  add column if not exists custom_roles jsonb not null default '[]'::jsonb;

-- Allow custom role slugs on users (system roles: viewer, editor, admin, dev).
alter table public.app_users drop constraint if exists app_users_role_check;
