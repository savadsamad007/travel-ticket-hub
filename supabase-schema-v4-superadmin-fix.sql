-- ============================================================
-- SKYBIRD v4 — RUN ONCE in Supabase → SQL Editor → New query.
-- Fixes:
--   1) RLS so super_admin can manage staff / agency / data.
--   2) Adds "Cash in Hand" + "Bank" as VIRTUAL SUPPLIERS so you
--      can record tickets bought from local market with no invoice.
-- Safe / idempotent.
-- ============================================================

-- ---------- 1) super_admin RLS ----------
do $$ begin
  alter type public.app_role add value if not exists 'super_admin';
exception when duplicate_object then null; end $$;

create or replace function public.is_admin_like() returns boolean
language sql stable security definer set search_path = public as $$
  select role::text in ('admin','super_admin')
  from public.user_agency where user_id = auth.uid()
$$;

create or replace function public.handle_new_user_agency()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested_owner uuid := nullif(new.raw_user_meta_data->>'agency_owner', '')::uuid;
  requested_role text := coalesce(new.raw_user_meta_data->>'staff_role', 'admin');
  requested_permissions jsonb := coalesce((new.raw_user_meta_data->'permissions')::jsonb, '{}'::jsonb);
begin
  if requested_owner is not null
     and requested_owner <> new.id
     and exists (
       select 1 from public.user_agency
       where user_id = requested_owner
         and agency_owner = requested_owner
         and role::text in ('admin','super_admin')
     ) then
    insert into public.user_agency (user_id, agency_owner, role, full_name, permissions)
    values (
      new.id,
      requested_owner,
      case when requested_role = 'admin' then 'admin'::public.app_role else 'salesman'::public.app_role end,
      coalesce(new.raw_user_meta_data->>'full_name', new.email),
      requested_permissions
    )
    on conflict (user_id) do nothing;
  else
    insert into public.user_agency (user_id, agency_owner, role, full_name)
    values (new.id, new.id, 'admin', coalesce(new.raw_user_meta_data->>'full_name', new.email))
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_agency on auth.users;
create trigger on_auth_user_created_agency
  after insert on auth.users for each row execute function public.handle_new_user_agency();

drop policy if exists "ua_admin_insert" on public.user_agency;
create policy "ua_admin_insert" on public.user_agency for insert
  with check (agency_owner = public.my_agency_owner() and public.is_admin_like());

drop policy if exists "ua_staff_claim_signup" on public.user_agency;
create policy "ua_staff_claim_signup" on public.user_agency for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

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

-- ---------- 2) Virtual suppliers (Cash / Bank) ----------
alter table public.suppliers
  add column if not exists kind text not null default 'supplier';

do $$ begin
  alter table public.suppliers
    add constraint suppliers_kind_chk check (kind in ('supplier','cash','bank'));
exception when duplicate_object then null; end $$;

-- Auto-seed one Cash + one Bank "supplier" for every existing agency
insert into public.suppliers (owner_id, name, kind)
select s.agency_owner, '💵 Cash in Hand', 'cash'
  from (select distinct agency_owner from public.user_agency) s
 where not exists (
   select 1 from public.suppliers
    where owner_id = s.agency_owner and kind = 'cash'
 );

insert into public.suppliers (owner_id, name, kind)
select s.agency_owner, '🏦 Bank', 'bank'
  from (select distinct agency_owner from public.user_agency) s
 where not exists (
   select 1 from public.suppliers
    where owner_id = s.agency_owner and kind = 'bank'
 );

-- New-agency trigger: seed virtual suppliers automatically
create or replace function public.seed_virtual_suppliers()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role::text in ('admin','super_admin') and new.user_id = new.agency_owner then
    insert into public.suppliers (owner_id, name, kind)
    values (new.agency_owner, '💵 Cash in Hand', 'cash')
    on conflict do nothing;
    insert into public.suppliers (owner_id, name, kind)
    values (new.agency_owner, '🏦 Bank', 'bank')
    on conflict do nothing;
  end if;
  return new;
end$$;

drop trigger if exists on_user_agency_seed_virtual on public.user_agency;
create trigger on_user_agency_seed_virtual
  after insert on public.user_agency
  for each row execute function public.seed_virtual_suppliers();

-- ---------- 3) Walk-in customer flag ----------
alter table public.customers
  add column if not exists is_walk_in boolean not null default false;

-- ============== DONE ==============
