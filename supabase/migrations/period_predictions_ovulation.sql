-- Store locked ovulation predictions alongside locked period starts

alter table public.period_predictions
  add column if not exists predicted_ovulation date;
