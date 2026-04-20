-- Migration: Create nearby_admins table for database-driven admin access
create table if not exists nearby_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_role text not null default 'chief',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz
);

-- RLS: Only allow access to active admins
alter table nearby_admins enable row level security;

create policy "Admins can view their own admin records" on nearby_admins
  for select using (auth.uid() = user_id);

create policy "Admins can view all admins if active" on nearby_admins
  for select using (is_active);

-- Grant insert/update/delete only to server role (adjust as needed)
-- (You may want to restrict further in production)
