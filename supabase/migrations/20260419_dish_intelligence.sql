-- Dish intelligence: visual memory, place-level dish stats, analysis audit log
-- Run this migration in Supabase SQL editor or via supabase db push

-- ── 1. dish_visual_memory ───────────────────────────────────────────────────
-- Stores confirmed dish-photo patterns. Each row represents a confirmed dish
-- sighting, optionally linked to a specific place. Future uploads can query
-- this table to find visually similar confirmed dishes as ranking signals.

create table if not exists public.dish_visual_memory (
  id                    uuid        primary key default gen_random_uuid(),
  canonical_dish_name   text        not null,
  alternate_names       jsonb       not null default '[]'::jsonb,
  place_id              uuid        null,
  photo_url             text        null,
  image_embedding       jsonb       null,  -- future: pgvector or compact float array
  visual_characteristics jsonb      not null default '{}'::jsonb,
  cuisine               text        null,
  confirmed_count       integer     not null default 1,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  last_confirmed_at     timestamptz not null default now()
);

create index if not exists dish_visual_memory_dish_name_idx
  on public.dish_visual_memory(canonical_dish_name);

create index if not exists dish_visual_memory_place_idx
  on public.dish_visual_memory(place_id)
  where place_id is not null;

create index if not exists dish_visual_memory_confirmed_count_idx
  on public.dish_visual_memory(confirmed_count desc);

-- ── 2. place_dish_stats ─────────────────────────────────────────────────────
-- Tracks how often each dish has been added, confirmed, and viewed at a place.
-- Used as a ranking signal: if a place frequently has Bak Chor Mee confirmed,
-- future photo uploads at that place get a higher prior for Bak Chor Mee.

create table if not exists public.place_dish_stats (
  id                    uuid        primary key default gen_random_uuid(),
  place_id              uuid        not null,
  canonical_dish_name   text        not null,
  add_count             integer     not null default 0,
  confirm_count         integer     not null default 0,
  view_count            integer     not null default 0,
  last_seen_at          timestamptz not null default now(),
  confidence_trend      numeric     null,  -- future: rolling average confidence
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique(place_id, canonical_dish_name)
);

create index if not exists place_dish_stats_place_idx
  on public.place_dish_stats(place_id);

create index if not exists place_dish_stats_confirm_count_idx
  on public.place_dish_stats(place_id, confirm_count desc);

-- ── 3. dish_analysis_events ─────────────────────────────────────────────────
-- Full audit log of each analysis run. Lets us track what the AI suggested,
-- what the user actually chose, and whether the suggestion was confirmed.
-- Powers future fine-tuning and accuracy reporting.

create table if not exists public.dish_analysis_events (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        null,
  place_id              uuid        null,
  uploaded_photo_url    text        null,
  ai_raw_result         jsonb       not null default '{}'::jsonb,
  suggested_dishes      jsonb       not null default '[]'::jsonb,
  final_selected_dish   text        null,
  was_confirmed         boolean     not null default false,
  created_at            timestamptz not null default now()
);

create index if not exists dish_analysis_events_place_idx
  on public.dish_analysis_events(place_id)
  where place_id is not null;

create index if not exists dish_analysis_events_user_idx
  on public.dish_analysis_events(user_id)
  where user_id is not null;

create index if not exists dish_analysis_events_created_at_idx
  on public.dish_analysis_events(created_at desc);

-- ── updated_at triggers ─────────────────────────────────────────────────────
-- Only create the function if it does not already exist under this signature.

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'dish_visual_memory_updated_at'
  ) then
    create trigger dish_visual_memory_updated_at
      before update on public.dish_visual_memory
      for each row execute function public.set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'place_dish_stats_updated_at'
  ) then
    create trigger place_dish_stats_updated_at
      before update on public.place_dish_stats
      for each row execute function public.set_updated_at();
  end if;
end $$;
