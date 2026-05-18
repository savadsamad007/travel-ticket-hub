-- =====================================================
-- SKYBIRD v3 — per-staff permissions + report email field
-- Run ONCE in Supabase → SQL Editor → New query.
-- Safe / idempotent.
-- =====================================================

-- Per-staff feature toggles (JSON keys = page names)
alter table public.user_agency
  add column if not exists permissions jsonb not null default '{}'::jsonb;

-- Default permissions for existing salesmen (admin ignores this)
update public.user_agency
   set permissions = jsonb_build_object(
     'tickets', true, 'customers', true, 'payments', true,
     'refunds', false, 'suppliers', false, 'sub_agents', false,
     'cash_book', false, 'reports', false, 'statements', false
   )
 where role = 'salesman'
   and (permissions = '{}'::jsonb or permissions is null);

-- Admin can update permissions for staff in own agency (already covered by ua_admin_update)

-- Report recipient email on agency profile
alter table public.agency_profile
  add column if not exists report_email text;

-- ============== DONE ==============
