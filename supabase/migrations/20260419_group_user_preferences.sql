-- Per-user group visibility preferences (hide/show groups).

create table if not exists public.group_user_preferences (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  individual_id uuid not null references public.users(id) on delete cascade,
  is_hidden boolean not null default false,
  updated_at timestamptz not null default now()
);

create unique index if not exists group_user_preferences_group_individual_uidx
  on public.group_user_preferences(group_id, individual_id);

create index if not exists group_user_preferences_individual_hidden_idx
  on public.group_user_preferences(individual_id, is_hidden);
