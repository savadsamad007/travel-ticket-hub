-- ============================================================
-- SKYBIRD — FIX RLS FOR super_admin role
-- Run ONCE in Supabase → SQL Editor.
-- Fixes "new row violates row-level security policy" when a
-- super_admin tries to create staff, edit agency profile, etc.
-- ============================================================

create or replace function public.is_admin_like() returns boolean
language sql stable security definer set search_path = public as $$
  select role::text in ('admin','super_admin')
  from public.user_agency where user_id = auth.uid()
$$;

drop policy if exists "ua_admin_insert" on public.user_agency;
create policy "ua_admin_insert" on public.user_agency for insert
  with check (agency_owner = public.my_agency_owner() and public.is_admin_like());

drop policy if exists "ua_admin_update" on public.user_agency;
create policy "ua_admin_update" on public.user_agency for update
  using (agency_owner = public.my_agency_owner() and public.is_admin_like());

drop policy if exists "ua_admin_delete" on public.user_agency;
create policy "ua_admin_delete" on public.user_agency for delete
  using (agency_owner = public.my_agency_owner()
         and public.is_admin_like()
         and user_id <> auth.uid());

drop policy if exists "ap_admin_upsert" on public.agency_profile;
create policy "ap_admin_upsert" on public.agency_profile for insert
  with check (agency_owner = public.my_agency_owner() and public.is_admin_like());

drop policy if exists "ap_admin_update" on public.agency_profile;
create policy "ap_admin_update" on public.agency_profile for update
  using (agency_owner = public.my_agency_owner() and public.is_admin_like());

do $$
declare t text;
begin
  foreach t in array array['suppliers','sub_agents','customers','tickets','ticket_services','payments','refunds']
  loop
    execute format('drop policy if exists "%1$s_admin_delete" on public.%1$s', t);
    execute format(
      'create policy "%1$s_admin_delete" on public.%1$s for delete
         using (owner_id = public.my_agency_owner() and public.is_admin_like())', t);
  end loop;
end$$;

-- ============== DONE ==============
