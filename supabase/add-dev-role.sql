-- Add dev role for developer-only pages (Dev → Logs).

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users
  add constraint app_users_role_check check (role in ('viewer', 'editor', 'admin', 'dev'));
