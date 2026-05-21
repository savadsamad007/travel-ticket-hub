-- ============================================================
-- SKYBIRD — SOFT DELETE + EDIT RULES
-- Run in: Supabase SQL editor
-- Idempotent: safe to re-run.
--
-- Rules implemented:
--  * Salesman   -> cannot UPDATE, cannot DELETE any record.
--  * Admin      -> can UPDATE, can "delete" (soft delete only).
--  * SuperAdmin -> same as Admin (soft delete only, never hard delete).
--
-- Soft delete = we DO NOT remove the row.
--   We set: is_deleted = true, deleted_at = now(), deleted_by = auth.uid()
--   Queries in the app should filter:  where is_deleted = false
-- ============================================================

-- ---------- 1. Add soft-delete columns to every business table ----------
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
    execute format('create index if not exists %I on public.%I (is_deleted)', t||'_isdel_idx', t);
  end loop;
end $$;

-- ---------- 2. Block hard DELETE for everyone (no real deletes) ----------
-- Drop any old "admin delete" policies and replace with deny-all.
do $$
declare t text;
begin
  foreach t in array array[
    'tickets','ticket_services','payments','refunds',
    'customers','suppliers','sub_agents'
  ] loop
    execute format('drop policy if exists "%s_delete_admin"   on public.%I', t, t);
    execute format('drop policy if exists "%s_delete_owner"   on public.%I', t, t);
    execute format('drop policy if exists "%s_delete"         on public.%I', t, t);
    -- No DELETE policy at all => RLS denies DELETE for everyone.
  end loop;
end $$;

-- ---------- 3. Block UPDATE for salesmen ----------
-- Only admin / super_admin in the same agency can update.
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
      using ( owner_id = public.my_agency_owner() and public.is_admin_like() )
      with check ( owner_id = public.my_agency_owner() and public.is_admin_like() )
    $f$, t);
  end loop;
end $$;

-- Note: tickets/payments/etc use column owner_id; if your table uses a
-- different column, edit the policy above to match.

-- ---------- 4. Helper: mark a row as deleted (call from the app) ----------
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
  execute format(
    'update public.%I set is_deleted = true, deleted_at = now(), deleted_by = auth.uid()
     where id = $1 and owner_id = public.my_agency_owner()',
    _table
  ) using _id;
end $$;

grant execute on function public.soft_delete(text, uuid) to authenticated;

-- ============================================================
-- DONE.
-- App should:
--   * call public.soft_delete('tickets', '<id>') instead of DELETE
--   * add  .eq('is_deleted', false)  to every SELECT
-- ============================================================
