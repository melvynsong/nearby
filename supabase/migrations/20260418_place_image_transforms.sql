-- Store per-photo presentation transforms without changing original image assets.
-- Idempotent migration: safe to run multiple times.

alter table if exists public.places
  add column if not exists image_transforms jsonb not null default '{}'::jsonb;
