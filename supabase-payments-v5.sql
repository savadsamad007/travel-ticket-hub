-- ============================================================
-- SKYBIRD v5 — Payments routing & Cash-in-Hand live balance.
-- Safe / idempotent. Run in Supabase → SQL Editor → New query.
--
-- What this does:
--  1) Ensures payments.ticket_id exists (link a payment to a ticket).
--  2) Ensures virtual Cash-in-Hand & Bank suppliers exist for every agency.
--  3) No schema-breaking change — the app now mirrors payments to
--     the Cash-in-Hand / Bank / Supplier / Sub-agent selected as
--     the payment "method", so those balances update automatically.
-- ============================================================

-- (1) payments.ticket_id (nullable) — was added in earlier scripts, keep idempotent
alter table public.payments
  add column if not exists ticket_id uuid references public.tickets(id) on delete set null;

create index if not exists payments_ticket_idx on public.payments(ticket_id);

-- (2) Backfill Cash-in-Hand + Bank virtual suppliers for every agency
insert into public.suppliers (owner_id, name, kind)
select ua.agency_owner, '💵 Cash in Hand', 'cash'
  from (select distinct agency_owner from public.user_agency) ua
 where not exists (
   select 1 from public.suppliers
    where owner_id = ua.agency_owner and kind = 'cash' and is_deleted = false
 );

insert into public.suppliers (owner_id, name, kind)
select ua.agency_owner, '🏦 Bank', 'bank'
  from (select distinct agency_owner from public.user_agency) ua
 where not exists (
   select 1 from public.suppliers
    where owner_id = ua.agency_owner and kind = 'bank' and is_deleted = false
 );

-- ============== DONE ==============
