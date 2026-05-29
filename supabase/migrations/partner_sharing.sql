-- Partner read-only sharing
-- Run once in Supabase Dashboard → SQL Editor

create table if not exists public.partner_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  partner_email text not null,
  partner_id uuid references auth.users(id) on delete cascade,
  owner_email text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz default now(),
  accepted_at timestamptz,
  unique (owner_id, partner_email)
);

alter table public.partner_links enable row level security;

-- If table already existed without owner_email:
alter table public.partner_links add column if not exists owner_email text;

-- Owner: full manage on their invites
drop policy if exists "owner can manage" on public.partner_links;
create policy "owner can manage" on public.partner_links
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Partner: see pending invites sent to their email
drop policy if exists "partner can read by email" on public.partner_links;
create policy "partner can read by email" on public.partner_links
  for select
  using (lower(partner_email) = lower(auth.jwt() ->> 'email'));

-- Partner: accept invite (set partner_id + accepted)
drop policy if exists "partner can accept own invite" on public.partner_links;
create policy "partner can accept own invite" on public.partner_links
  for update
  using (lower(partner_email) = lower(auth.jwt() ->> 'email'))
  with check (partner_id = auth.uid() and status = 'accepted');

-- Partner: read accepted links where they are the partner
drop policy if exists "partner can read accepted" on public.partner_links;
create policy "partner can read accepted" on public.partner_links
  for select
  using (partner_id = auth.uid() and status = 'accepted');

-- Helper: is current user an accepted partner of target owner?
create or replace function public.is_partner_of(target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.partner_links
    where owner_id = target
      and partner_id = auth.uid()
      and status = 'accepted'
  );
$$;

revoke all on function public.is_partner_of(uuid) from public;
grant execute on function public.is_partner_of(uuid) to authenticated;

-- Read-only partner access to cycle data
drop policy if exists "partner can read profile" on public.profiles;
create policy "partner can read profile" on public.profiles
  for select
  using (public.is_partner_of(id));

drop policy if exists "partner can read cycles" on public.cycles;
create policy "partner can read cycles" on public.cycles
  for select
  using (public.is_partner_of(user_id));

drop policy if exists "partner can read logs" on public.cycle_logs;
create policy "partner can read logs" on public.cycle_logs
  for select
  using (public.is_partner_of(user_id));
