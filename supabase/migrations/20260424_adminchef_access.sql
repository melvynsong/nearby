-- Migration: Create adminchef_access table for AdminChef access control
create table if not exists adminchef_access (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  phone_last4 text not null,
  display_name text null,
  role text not null default 'owner',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Initial seed row
insert into adminchef_access (phone_number, phone_last4, display_name, role, is_active)
values ('97100453', '0453', 'Melvyn', 'owner', true)
on conflict (phone_number) do nothing;

-- updated_at trigger (if not present, create a simple one)
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_adminchef_access_updated_at on adminchef_access;
create trigger trg_adminchef_access_updated_at
before update on adminchef_access
for each row execute procedure set_updated_at();

-- Enable RLS
alter table adminchef_access enable row level security;

-- RLS: Only allow service role to select
create policy "Service role can select adminchef_access" on adminchef_access
  for select using (auth.role() = 'service_role');

-- RLS: Only allow service role to insert/update/delete
create policy "Service role can modify adminchef_access" on adminchef_access
  for all using (auth.role() = 'service_role');
