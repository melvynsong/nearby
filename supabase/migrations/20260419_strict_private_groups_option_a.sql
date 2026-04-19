-- Strict private groups (Option A): invite + passcode + direct join.

-- Invitations per group by phone number.
create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  phone_number text not null,
  invited_by uuid references public.users(id) on delete set null,
  status text not null default 'invited',
  created_at timestamptz not null default now(),
  joined_at timestamptz
);

do $$
begin
  alter table public.group_invites
    add constraint group_invites_status_check
    check (status in ('invited', 'joined'));
exception
  when duplicate_object then null;
end $$;

create unique index if not exists group_invites_group_phone_uidx
  on public.group_invites(group_id, phone_number);

create index if not exists group_invites_group_status_idx
  on public.group_invites(group_id, status);

-- Membership role model while keeping legacy columns for compatibility.
alter table if exists public.group_memberships
  add column if not exists individual_id uuid,
  add column if not exists role text not null default 'member',
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  alter table public.group_memberships
    add constraint group_memberships_role_check
    check (role in ('owner', 'member'));
exception
  when duplicate_object then null;
end $$;

-- Backfill new fields from existing data.
update public.group_memberships
set individual_id = coalesce(individual_id, user_id)
where individual_id is null;

update public.group_memberships gm
set role = 'owner'
from public.groups g
where gm.group_id = g.id
  and gm.user_id = g.created_by_user_id;

update public.group_memberships
set role = coalesce(role, 'member')
where role is null;

create index if not exists group_memberships_group_role_idx
  on public.group_memberships(group_id, role);

create index if not exists group_memberships_individual_group_uidx
  on public.group_memberships(individual_id, group_id);
