-- ============================================================
-- SKYBIRD TRAVEL BILLING SYSTEM — DATABASE SCHEMA
-- Run this once in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Required extensions
create extension if not exists "pgcrypto";

-- ---------- PROFILES (per auth user) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_self_upsert" on public.profiles;
create policy "profiles_self_upsert" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- PARTIES: suppliers, sub_agents, customers ----------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  opening_balance numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.sub_agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  opening_balance numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz default now()
);

-- ---------- TICKETS ----------
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  ticket_no text,
  pnr text,
  passenger_name text not null,
  route text,
  travel_date date,
  airline text,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  buyer_type text not null check (buyer_type in ('customer','sub_agent')),
  buyer_id uuid not null,
  cost_price numeric(12,2) not null default 0,
  sale_price numeric(12,2) not null default 0,
  status text not null default 'booked' check (status in ('booked','paid','refunded','cancelled')),
  notes text,
  created_at timestamptz default now()
);

create index if not exists tickets_owner_idx on public.tickets(owner_id);
create index if not exists tickets_buyer_idx on public.tickets(buyer_type, buyer_id);
create index if not exists tickets_supplier_idx on public.tickets(supplier_id);
create index if not exists tickets_created_idx on public.tickets(created_at);

-- ---------- TICKET SERVICES (add-on luggage, date change, etc.) ----------
create table if not exists public.ticket_services (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  service_type text not null,  -- 'addon_luggage' | 'date_change' | 'other'
  description text,
  cost_price numeric(12,2) not null default 0,
  sale_price numeric(12,2) not null default 0,
  created_at timestamptz default now()
);
create index if not exists ticket_services_ticket_idx on public.ticket_services(ticket_id);

-- ---------- PAYMENTS (collections from buyers / payouts to suppliers) ----------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  party_type text not null check (party_type in ('supplier','sub_agent','customer')),
  party_id uuid not null,
  direction text not null check (direction in ('in','out')), -- in = received, out = paid
  amount numeric(12,2) not null check (amount >= 0),
  method text not null check (method in ('cash','bank','credit')),
  reference text,
  ticket_id uuid references public.tickets(id) on delete set null,
  notes text,
  created_at timestamptz default now()
);
create index if not exists payments_owner_idx on public.payments(owner_id);
create index if not exists payments_party_idx on public.payments(party_type, party_id);

-- ---------- REFUNDS ----------
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  customer_refund_amount numeric(12,2) not null default 0,
  supplier_retention_amount numeric(12,2) not null default 0,
  supplier_refund_amount numeric(12,2) not null default 0, -- amount supplier returns to us
  notes text,
  created_at timestamptz default now()
);
create index if not exists refunds_ticket_idx on public.refunds(ticket_id);

-- ============================================================
-- RLS — every row scoped to the authenticated owner (single-tenant per user)
-- ============================================================
alter table public.suppliers enable row level security;
alter table public.sub_agents enable row level security;
alter table public.customers enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_services enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;

do $$
declare t text;
begin
  foreach t in array array['suppliers','sub_agents','customers','tickets','ticket_services','payments','refunds']
  loop
    execute format('drop policy if exists "%1$s_owner_all" on public.%1$s', t);
    execute format(
      'create policy "%1$s_owner_all" on public.%1$s for all
         using (auth.uid() = owner_id)
         with check (auth.uid() = owner_id)', t);
  end loop;
end$$;

-- ============================================================
-- DONE. You can now sign up in the app and start using it.
-- ============================================================
