-- Add creator ownership to groups and backfill from first known membership.

alter table if exists public.groups
  add column if not exists created_by_user_id uuid references public.users(id) on delete set null;

create index if not exists groups_created_by_user_id_idx
  on public.groups(created_by_user_id);

with ranked_members as (
  select
    gm.group_id,
    gm.user_id,
    row_number() over (partition by gm.group_id order by gm.created_at asc) as rn
  from public.group_memberships gm
  where gm.user_id is not null
)
update public.groups g
set created_by_user_id = rm.user_id
from ranked_members rm
where g.id = rm.group_id
  and rm.rn = 1
  and g.created_by_user_id is null;
