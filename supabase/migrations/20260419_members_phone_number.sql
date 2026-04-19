alter table if exists public.members
  add column if not exists phone_number text;

update public.members as m
set phone_number = u.phone_number
from public.users as u
where m.user_id = u.id
  and (m.phone_number is null or m.phone_number = '');

create index if not exists members_phone_number_idx
  on public.members(phone_number)
  where phone_number is not null;