-- ============================================================
-- Fix duplicate "Cash in Hand" / "Bank" virtual suppliers
-- Safe / idempotent. Run in Supabase SQL editor AND mirror to MSSQL if needed.
-- ============================================================

-- 1) For each agency + kind ('cash','bank'), keep the OLDEST row.
--    Re-point any tickets/payments/refunds that referenced a duplicate
--    to the kept row, then delete the duplicates.

with ranked as (
  select id, owner_id, kind,
         row_number() over (partition by owner_id, kind order by created_at, id) as rn,
         first_value(id) over (partition by owner_id, kind order by created_at, id) as keep_id
    from public.suppliers
   where kind in ('cash','bank')
),
dups as (
  select id as dup_id, keep_id from ranked where rn > 1
)
update public.tickets t
   set supplier_id = d.keep_id
  from dups d
 where t.supplier_id = d.dup_id;

with ranked as (
  select id, owner_id, kind,
         row_number() over (partition by owner_id, kind order by created_at, id) as rn,
         first_value(id) over (partition by owner_id, kind order by created_at, id) as keep_id
    from public.suppliers
   where kind in ('cash','bank')
),
dups as (
  select id as dup_id, keep_id from ranked where rn > 1
)
update public.payments p
   set party_id = d.keep_id
  from dups d
 where p.party_type = 'supplier' and p.party_id = d.dup_id;

with ranked as (
  select id, owner_id, kind,
         row_number() over (partition by owner_id, kind order by created_at, id) as rn,
         first_value(id) over (partition by owner_id, kind order by created_at, id) as keep_id
    from public.suppliers
   where kind in ('cash','bank')
),
dups as (
  select dup_id from (select id as dup_id, rn from ranked) x where x.rn > 1
)
delete from public.suppliers s
 using dups d
 where s.id = d.dup_id;

-- 2) Prevent future duplicates with a partial unique index.
create unique index if not exists suppliers_one_virtual_per_kind
  on public.suppliers (owner_id, kind)
  where kind in ('cash','bank');

-- 3) Normalize names + (optional) drop emoji from labels.
update public.suppliers set name = 'Cash in Hand' where kind = 'cash';
update public.suppliers set name = 'Bank'         where kind = 'bank';

-- ============== DONE ==============
