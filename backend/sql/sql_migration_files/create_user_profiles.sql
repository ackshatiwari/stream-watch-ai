create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  role text not null default 'user' check (role in ('admin', 'user'))
);

alter table profiles enable row level security;

-- create policy saying that profiles can be read and updates by the user (but only the name can be updated)

create policy "Profiles can be read by the user" on public.profiles
  for select using (auth.uid() = id);

create policy "Profiles can be updated by the user" on public.profiles
  for update using (auth.uid() = id)



