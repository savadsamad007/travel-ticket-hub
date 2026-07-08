-- ============================================================
-- EXTERNAL REFUNDS + TICKET NUMBER UNIQUENESS
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1) Allow refunds not tied to a ticket in our system
alter table public.refunds alter column ticket_id drop not null;

-- 2) External ticket details (used when ticket_id is null)
alter table public.refunds add column if not exists external_ticket_no text;
alter table public.refunds add column if not exists external_passenger  text;
alter table public.refunds add column if not exists external_airline    text;
alter table public.refunds add column if not exists external_route      text;
alter table public.refunds add column if not exists external_party_type text
  check (external_party_type in ('supplier','sub_agent','customer'));
alter table public.refunds add column if not exists external_party_id   uuid;

-- 3) Unique ticket_no per owner (ignoring soft-deleted rows and blanks)
create unique index if not exists tickets_owner_ticket_no_uniq
  on public.tickets(owner_id, ticket_no)
  where ticket_no is not null
    and ticket_no <> ''
    and is_deleted = false;
