-- Personal passcode support for easier member access.
-- Keeps group access_code flow intact while adding optional user-level passcode.

alter table if exists public.users
  add column if not exists personal_passcode text;

create index if not exists users_personal_passcode_idx
  on public.users(personal_passcode)
  where personal_passcode is not null;
