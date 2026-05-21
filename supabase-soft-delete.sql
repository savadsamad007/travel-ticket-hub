-- ============================================================
-- SKYBIRD — NO HARD DELETE / SOFT DELETE v2
-- Run in: Supabase SQL editor
-- Idempotent: safe to re-run.
--
-- IMPORTANT FIX:
-- v4 created DELETE policies named "tickets_admin_delete" etc.
-- The older soft-delete file did not drop those names, so hard deletes
-- could still happen. This script removes those policies too.
-- ============================================================

-- ---------- 1. Add soft-delete + sync columns ----------
do $$
declare t text;
begin
  foreach t in array array[
    'tickets','ticket_services','payments','refunds',
    'customers','suppliers','sub_agents'
  ] loop
    execute format('alter table public.%I add column if not exists is_deleted boolean not null default false', t);
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
    execute format('alter table public.%I add column if not exists deleted_by uuid', t);
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('update public.%I set updated_at = coalesce(deleted_at, created_at, now()) where updated_at is null', t);
    execute format('create index if not exists %I on public.%I (is_deleted)', t||'_isdel_idx', t);
    execute format('create index if not exists %I on public.%I (updated_at)', t||'_updated_idx', t);
  end loop;
end $$;

alter table public.user_agency
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists user_agency_isdel_idx on public.user_agency (is_deleted);
create index if not exists user_agency_updated_idx on public.user_agency (updated_at);

-- Allow tickets to carry status = deleted after soft delete.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.tickets'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.tickets drop constraint if exists %I', c.conname);
  end loop;
end $$;
alter table public.tickets
  add constraint tickets_status_chk
  check (status in ('booked','paid','refunded','cancelled','deleted'));

-- ---------- 2. updated_at trigger for MSSQL sync ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'tickets','ticket_services','payments','refunds',
    'customers','suppliers','sub_agents','user_agency'
  ] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', t, t);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------- 3. Helpers must ignore deleted staff ----------
create or replace function public.my_agency_owner() returns uuid
language sql stable security definer set search_path = public as $$
  select agency_owner
  from public.user_agency
  where user_id = auth.uid()
    and coalesce(is_deleted, false) = false
  limit 1
$$;

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role
  from public.user_agency
  where user_id = auth.uid()
    and coalesce(is_deleted, false) = false
  limit 1
$$;

create or replace function public.is_admin_like() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select role::text in ('admin','super_admin')
    from public.user_agency
    where user_id = auth.uid()
      and coalesce(is_deleted, false) = false
    limit 1
  ), false)
$$;

-- ---------- 4. Block hard DELETE for everyone ----------
do $$
declare t text;
begin
  foreach t in array array[
    'tickets','ticket_services','payments','refunds',
    'customers','suppliers','sub_agents'
  ] loop
    execute format('drop policy if exists "%s_admin_delete"  on public.%I', t, t);
    execute format('drop policy if exists "%s_delete_admin"  on public.%I', t, t);
    execute format('drop policy if exists "%s_delete_owner"  on public.%I', t, t);
    execute format('drop policy if exists "%s_delete"        on public.%I', t, t);
  end loop;
end $$;

drop policy if exists "ua_admin_delete" on public.user_agency;

-- ---------- 5. Block UPDATE for salesmen ----------
do $$
declare t text;
begin
  foreach t in array array[
    'tickets','ticket_services','payments','refunds',
    'customers','suppliers','sub_agents'
  ] loop
    execute format('drop policy if exists "%s_update_owner"  on public.%I', t, t);
    execute format('drop policy if exists "%s_update_admin"  on public.%I', t, t);
    execute format('drop policy if exists "%s_update"        on public.%I', t, t);

    execute format($f$
      create policy "%1$s_update_admin" on public.%1$I
      for update to authenticated
      using (owner_id = public.my_agency_owner() and public.is_admin_like())
      with check (owner_id = public.my_agency_owner() and public.is_admin_like())
    $f$, t);
  end loop;
end $$;

-- ---------- 6. Helper: mark a row as deleted ----------
create or replace function public.soft_delete(_table text, _id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_like() then
    raise exception 'Only admin can delete';
  end if;

  if _table not in ('tickets','ticket_services','payments','refunds','customers','suppliers','sub_agents','user_agency') then
    raise exception 'Soft delete is not allowed for table %', _table;
  end if;

  if _table = 'user_agency' then
    update public.user_agency
       set is_deleted = true, deleted_at = now(), deleted_by = auth.uid(), updated_at = now(), permissions = '{}'::jsonb
     where user_id = _id
       and agency_owner = public.my_agency_owner()
       and user_id <> auth.uid();
    return;
  end if;

  execute format(
    'update public.%I
        set is_deleted = true,
            deleted_at = now(),
            deleted_by = auth.uid(),
            updated_at = now()
      where id = $1
        and owner_id = public.my_agency_owner()',
    _table
  ) using _id;

  if _table = 'tickets' then
    update public.tickets set status = 'deleted', updated_at = now() where id = _id;
    update public.ticket_services
       set is_deleted = true, deleted_at = now(), deleted_by = auth.uid(), updated_at = now()
     where ticket_id = _id and owner_id = public.my_agency_owner();
  end if;
end $$;

grant execute on function public.soft_delete(text, uuid) to authenticated;

-- ============================================================
-- DONE.
-- Use this app version + this SQL. From now on app Delete = soft delete only.
-- ============================================================
