alter table public.users
  add column if not exists preferences jsonb not null default '{}'::jsonb;
