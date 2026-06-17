-- Organization-wide maintenance mode (blocks viewers and editors; admins and devs keep access).

alter table public.app_settings
  add column if not exists maintenance_mode boolean not null default false;
