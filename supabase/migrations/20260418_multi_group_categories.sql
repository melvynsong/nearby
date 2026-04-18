-- Multi-group and category model hardening for Nearby
-- Idempotent migration: safe to run multiple times.

create extension if not exists pgcrypto;

-- 1) Group memberships (many-to-many user <-> group)
create table if not exists public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists group_memberships_user_group_unique
  on public.group_memberships(user_id, group_id);

create index if not exists group_memberships_group_id_idx
  on public.group_memberships(group_id);

create index if not exists group_memberships_user_id_idx
  on public.group_memberships(user_id);

-- Backfill memberships from existing members when possible.
insert into public.group_memberships (user_id, group_id, member_id)
select m.user_id, m.group_id, m.id
from public.members m
where m.user_id is not null
on conflict (user_id, group_id) do update
set member_id = excluded.member_id;

-- 2) Food categories should be unique within each group (case-insensitive)
create unique index if not exists food_categories_group_name_unique_lower
  on public.food_categories(group_id, lower(name));

-- 3) Ensure place/category linking can be safely upserted
create unique index if not exists place_categories_place_category_unique
  on public.place_categories(place_id, category_id);

-- 4) Helpful index for place reuse by google_place_id
create unique index if not exists places_google_place_id_unique
  on public.places(google_place_id);
