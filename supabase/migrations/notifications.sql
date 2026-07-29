-- Notifications + display name
-- Run once in Supabase Dashboard → SQL Editor

-- Display name on profiles
alter table public.profiles
  add column if not exists display_name text;

-- Notification preferences (one row per user)
create table if not exists public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.notification_prefs enable row level security;

drop policy if exists "users manage own notification prefs" on public.notification_prefs;
create policy "users manage own notification prefs" on public.notification_prefs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Push subscriptions (one endpoint per device)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  timezone text not null default 'UTC',
  created_at timestamptz default now(),
  unique (endpoint)
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "users manage own push subscriptions" on public.push_subscriptions;
create policy "users manage own push subscriptions" on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Dedupe log for scheduled notifications
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  target_date date not null,
  slot text not null,
  sent_at timestamptz default now(),
  unique (user_id, kind, target_date, slot)
);

create index if not exists notification_log_user_id_idx
  on public.notification_log (user_id);

alter table public.notification_log enable row level security;

-- Users can read their own log (optional); inserts done via service role
drop policy if exists "users read own notification log" on public.notification_log;
create policy "users read own notification log" on public.notification_log
  for select
  using (auth.uid() = user_id);
