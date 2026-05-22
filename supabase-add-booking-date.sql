-- Run once in Supabase SQL editor
alter table public.tickets
  add column if not exists booking_date date default current_date;
