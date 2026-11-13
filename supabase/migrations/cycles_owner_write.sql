-- Allow owners to update/delete their own cycles
-- (table previously only had SELECT + INSERT for owners)

drop policy if exists "Users can delete own cycles" on public.cycles;
create policy "Users can delete own cycles" on public.cycles
  for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can update own cycles" on public.cycles;
create policy "Users can update own cycles" on public.cycles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
