-- Add a chosen payment date to payments
-- Run this in Supabase SQL editor

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS paid_at date;

-- Backfill existing rows from created_at
UPDATE public.payments
   SET paid_at = created_at::date
 WHERE paid_at IS NULL;
