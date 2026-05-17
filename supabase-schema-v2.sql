-- ============================================================
-- SKYBIRD v2 — ADDS: roles/staff, agency profile, cash-in-hand,
-- service-only tickets (no supplier needed), shared agency data.
--
-- RUN ONCE in Supabase → SQL Editor → New query.
-- Safe to run on top of the existing v1 schema (idempotent).
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- ROLES ----------
do $$ begin
  create type public.app_role as enum ('admin','salesman');
exception when duplicate_object then null; end $$;

-- Maps each auth user to ONE agency (owner = admin's auth.uid)
create table if not exists public.user_agency (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  agency_owner uuid not null references auth.users(id) on delete cascade,
  role         public.app_role not null default 'admin',
  full_name    text,
  created_at   timestamptz default now()
);
create index if not exists user_agency_owner_idx on public.user_agency(agency_owner);

alter table public.user_agency enable row level security;

-- helpers (security definer => bypass RLS, no recursion)
create or replace function public.my_agency_owner() returns uuid
language sql stable security definer set search_path = public as $$
  select agency_owner from public.user_agency where user_id = auth.uid()
$$;

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.user_agency where user_id = auth.uid()
$$;

-- self can read own row; admin can read all rows in their agency
drop policy if exists "ua_select_self" on public.user_agency;
create policy "ua_select_self" on public.user_agency for select
  using (user_id = auth.uid() or agency_owner = public.my_agency_owner());

-- admin manages staff in their own agency
drop policy if exists "ua_admin_insert" on public.user_agency;
create policy "ua_admin_insert" on public.user_agency for insert
  with check (agency_owner = public.my_agency_owner() and public.my_role() = 'admin');

drop policy if exists "ua_admin_update" on public.user_agency;
create policy "ua_admin_update" on public.user_agency for update
  using (agency_owner = public.my_agency_owner() and public.my_role() = 'admin');

drop policy if exists "ua_admin_delete" on public.user_agency;
create policy "ua_admin_delete" on public.user_agency for delete
  using (agency_owner = public.my_agency_owner()
         and public.my_role() = 'admin'
         and user_id <> auth.uid());

-- auto-create admin row on first signup (no-op if row already inserted by app)
create or replace function public.handle_new_user_agency()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_agency (user_id, agency_owner, role, full_name)
  values (new.id, new.id, 'admin', coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_agency on auth.users;
create trigger on_auth_user_created_agency
  after insert on auth.users for each row execute function public.handle_new_user_agency();

-- backfill: every existing user becomes admin of own agency
insert into public.user_agency (user_id, agency_owner, role, full_name)
select u.id, u.id, 'admin', coalesce(p.full_name, u.email)
from auth.users u
left join public.profiles p on p.id = u.id
on conflict (user_id) do nothing;

-- ---------- AGENCY PROFILE (1 row per agency) ----------
create table if not exists public.agency_profile (
  agency_owner   uuid primary key references auth.users(id) on delete cascade,
  agency_name    text not null default 'My Agency',
  legal_name     text,
  phone          text,
  email          text,
  address        text,
  cr_number      text,
  vat_number     text,
  logo_url       text,
  opening_cash   numeric(12,2) not null default 0,
  updated_at     timestamptz default now()
);
alter table public.agency_profile enable row level security;
drop policy if exists "ap_select" on public.agency_profile;
create policy "ap_select" on public.agency_profile for select
  using (agency_owner = public.my_agency_owner());
drop policy if exists "ap_admin_upsert" on public.agency_profile;
create policy "ap_admin_upsert" on public.agency_profile for insert
  with check (agency_owner = public.my_agency_owner() and public.my_role() = 'admin');
drop policy if exists "ap_admin_update" on public.agency_profile;
create policy "ap_admin_update" on public.agency_profile for update
  using (agency_owner = public.my_agency_owner() and public.my_role() = 'admin');

-- ---------- SERVICE-ONLY TICKETS ----------
-- tickets bought from another agency: supplier may be null, cost may be 0.
alter table public.tickets alter column supplier_id drop not null;
alter table public.tickets add column if not exists is_service_only boolean not null default false;

-- ============================================================
-- REPLACE OLD owner-only RLS with shared-agency RLS
-- Salesman can do everything EXCEPT delete.
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['suppliers','sub_agents','customers','tickets','ticket_services','payments','refunds']
  loop
    execute format('drop policy if exists "%1$s_owner_all" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_agency_select" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_agency_insert" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_agency_update" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_admin_delete"  on public.%1$s', t);

    execute format(
      'create policy "%1$s_agency_select" on public.%1$s for select
         using (owner_id = public.my_agency_owner())', t);
    execute format(
      'create policy "%1$s_agency_insert" on public.%1$s for insert
         with check (owner_id = public.my_agency_owner())', t);
    execute format(
      'create policy "%1$s_agency_update" on public.%1$s for update
         using (owner_id = public.my_agency_owner())', t);
    execute format(
      'create policy "%1$s_admin_delete" on public.%1$s for delete
         using (owner_id = public.my_agency_owner() and public.my_role() = ''admin'')', t);
  end loop;
end$$;

-- ============================================================
-- DONE.
-- ============================================================
