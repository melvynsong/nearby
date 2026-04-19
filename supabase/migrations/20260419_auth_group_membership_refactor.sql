-- Individuals: ensure durable auth fields exist.
alter table if exists public.users
  add column if not exists passcode_hash text,
  add column if not exists onboarded boolean not null default false,
  add column if not exists last_logged_in_at timestamptz;

-- Keep existing personal_passcode_hash data usable by the new passcode_hash field.
update public.users
set passcode_hash = personal_passcode_hash
where (passcode_hash is null or passcode_hash = '')
  and personal_passcode_hash is not null;

-- Groups: add required metadata while preserving existing access_code usage.
alter table if exists public.groups
  add column if not exists title text,
  add column if not exists visibility text not null default 'public';

do $$
begin
  alter table public.groups
    add constraint groups_visibility_check
    check (visibility in ('public', 'private'));
exception
  when duplicate_object then null;
end $$;

-- Memberships: add status + approval + onboarding lifecycle fields.
alter table if exists public.group_memberships
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists status text not null default 'active',
  add column if not exists group_onboarded boolean not null default false,
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid;

do $$
begin
  alter table public.group_memberships
    add constraint group_memberships_status_check
    check (status in ('pending', 'active', 'rejected', 'removed'));
exception
  when duplicate_object then null;
end $$;

-- Normalize old rows.
update public.group_memberships
set status = 'active'
where status is null;

update public.group_memberships
set requested_at = coalesce(requested_at, now())
where requested_at is null;

-- Enforce one row per individual/group pair.
create unique index if not exists group_memberships_individual_group_uidx
  on public.group_memberships(user_id, group_id);

create index if not exists group_memberships_group_status_idx
  on public.group_memberships(group_id, status);

create index if not exists group_memberships_user_status_idx
  on public.group_memberships(user_id, status);