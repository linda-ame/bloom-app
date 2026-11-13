-- Locked period-start predictions (for actual vs predicted comparison)
-- Run once in Supabase Dashboard → SQL Editor

create table if not exists public.period_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  predicted_start date not null,
  created_at timestamptz default now(),
  unique (user_id, predicted_start)
);

alter table public.period_predictions enable row level security;

drop policy if exists "users manage own period predictions" on public.period_predictions;
create policy "users manage own period predictions" on public.period_predictions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "partner can read period predictions" on public.period_predictions;
create policy "partner can read period predictions" on public.period_predictions
  for select
  using (public.is_partner_of(user_id));
