-- Add Google rating columns to places table for showcase ranking.
-- Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

alter table public.places
  add column if not exists google_rating       numeric    null,
  add column if not exists google_rating_count integer    null;

create index if not exists places_google_rating_idx
  on public.places(google_rating desc nulls last)
  where google_rating is not null;
