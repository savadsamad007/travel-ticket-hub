-- ============================================================
-- SKYBIRD — MSSQL (home server) FULL SCHEMA
-- Run once in: SQL Server Management Studio against database [skybird]
-- Idempotent: safe to re-run.
--
-- Mirrors the Supabase tables that the bridge syncs, PLUS all
-- recent updates:
--   * user_agency  (email, created_by, permissions)
--   * staff_invites
--   * suppliers.kind  ('supplier' | 'cash' | 'bank')
--   * customers.is_walk_in
--   * agency_profile
-- ============================================================

USE [skybird];
GO

-- ---------- Bridge bookkeeping ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'sync_state')
CREATE TABLE sync_state (
  table_name      NVARCHAR(128) PRIMARY KEY,
  last_pulled_at  DATETIME2 NULL,
  last_pushed_at  DATETIME2 NULL
);
GO

-- ---------- Helper: add column if missing ----------
-- (We use IF NOT EXISTS blocks per column below.)

-- ============================================================
-- USER_AGENCY
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'user_agency')
CREATE TABLE user_agency (
  user_id        NVARCHAR(64) NOT NULL PRIMARY KEY,
  agency_owner   NVARCHAR(64) NULL,
  agency_code    NVARCHAR(64) NULL,
  role           NVARCHAR(32) NULL,
  full_name      NVARCHAR(255) NULL,
  email          NVARCHAR(255) NULL,
  permissions    NVARCHAR(MAX) NULL,   -- JSON
  created_by     NVARCHAR(64) NULL,
  created_at     NVARCHAR(64) NULL
);
GO
IF COL_LENGTH('user_agency','email')       IS NULL ALTER TABLE user_agency ADD email       NVARCHAR(255) NULL;
IF COL_LENGTH('user_agency','permissions') IS NULL ALTER TABLE user_agency ADD permissions NVARCHAR(MAX) NULL;
IF COL_LENGTH('user_agency','created_by')  IS NULL ALTER TABLE user_agency ADD created_by  NVARCHAR(64)  NULL;
GO

-- ============================================================
-- STAFF_INVITES
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'staff_invites')
CREATE TABLE staff_invites (
  token         NVARCHAR(64) NOT NULL PRIMARY KEY,
  agency_owner  NVARCHAR(64) NULL,
  email         NVARCHAR(255) NULL,
  role          NVARCHAR(32) NULL,
  full_name     NVARCHAR(255) NULL,
  permissions   NVARCHAR(MAX) NULL,
  created_by    NVARCHAR(64) NULL,
  used_by       NVARCHAR(64) NULL,
  used_at       NVARCHAR(64) NULL,
  created_at    NVARCHAR(64) NULL,
  expires_at    NVARCHAR(64) NULL
);
GO

-- ============================================================
-- AGENCY_PROFILE
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'agency_profile')
CREATE TABLE agency_profile (
  id            NVARCHAR(64) NOT NULL PRIMARY KEY,
  agency_owner  NVARCHAR(64) NULL,
  agency_name   NVARCHAR(255) NULL,
  address       NVARCHAR(MAX) NULL,
  phone         NVARCHAR(64) NULL,
  email         NVARCHAR(255) NULL,
  logo_url      NVARCHAR(MAX) NULL,
  tax_no        NVARCHAR(64) NULL,
  currency      NVARCHAR(16) NULL,
  notes         NVARCHAR(MAX) NULL,
  updated_at    NVARCHAR(64) NULL,
  created_at    NVARCHAR(64) NULL
);
GO

-- ============================================================
-- SUPPLIERS  (with kind = supplier | cash | bank)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'suppliers')
CREATE TABLE suppliers (
  id              NVARCHAR(64) NOT NULL PRIMARY KEY,
  owner_id        NVARCHAR(64) NULL,
  name            NVARCHAR(255) NULL,
  phone           NVARCHAR(64) NULL,
  email           NVARCHAR(255) NULL,
  opening_balance NVARCHAR(64) NULL,
  notes           NVARCHAR(MAX) NULL,
  kind            NVARCHAR(32) NULL DEFAULT 'supplier',
  created_at      NVARCHAR(64) NULL
);
GO
IF COL_LENGTH('suppliers','kind') IS NULL ALTER TABLE suppliers ADD kind NVARCHAR(32) NULL;
GO

-- ============================================================
-- SUB_AGENTS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'sub_agents')
CREATE TABLE sub_agents (
  id              NVARCHAR(64) NOT NULL PRIMARY KEY,
  owner_id        NVARCHAR(64) NULL,
  name            NVARCHAR(255) NULL,
  phone           NVARCHAR(64) NULL,
  email           NVARCHAR(255) NULL,
  opening_balance NVARCHAR(64) NULL,
  notes           NVARCHAR(MAX) NULL,
  created_at      NVARCHAR(64) NULL
);
GO

-- ============================================================
-- CUSTOMERS  (with is_walk_in)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'customers')
CREATE TABLE customers (
  id          NVARCHAR(64) NOT NULL PRIMARY KEY,
  owner_id    NVARCHAR(64) NULL,
  name        NVARCHAR(255) NULL,
  phone       NVARCHAR(64) NULL,
  email       NVARCHAR(255) NULL,
  notes       NVARCHAR(MAX) NULL,
  is_walk_in  NVARCHAR(8) NULL DEFAULT 'false',
  created_at  NVARCHAR(64) NULL
);
GO
IF COL_LENGTH('customers','is_walk_in') IS NULL ALTER TABLE customers ADD is_walk_in NVARCHAR(8) NULL;
GO

-- ============================================================
-- TICKETS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'tickets')
CREATE TABLE tickets (
  id              NVARCHAR(64) NOT NULL PRIMARY KEY,
  owner_id        NVARCHAR(64) NULL,
  ticket_no       NVARCHAR(128) NULL,
  pnr             NVARCHAR(64) NULL,
  passenger_name  NVARCHAR(255) NULL,
  route           NVARCHAR(255) NULL,
  travel_date     NVARCHAR(32) NULL,
  airline         NVARCHAR(128) NULL,
  supplier_id     NVARCHAR(64) NULL,
  buyer_type      NVARCHAR(32) NULL,
  buyer_id        NVARCHAR(64) NULL,
  cost_price      NVARCHAR(64) NULL,
  sale_price      NVARCHAR(64) NULL,
  status          NVARCHAR(32) NULL,
  notes           NVARCHAR(MAX) NULL,
  created_at      NVARCHAR(64) NULL
);
CREATE INDEX IX_tickets_owner    ON tickets(owner_id);
CREATE INDEX IX_tickets_buyer    ON tickets(buyer_type, buyer_id);
CREATE INDEX IX_tickets_supplier ON tickets(supplier_id);
GO

-- ============================================================
-- TICKET_SERVICES
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ticket_services')
CREATE TABLE ticket_services (
  id           NVARCHAR(64) NOT NULL PRIMARY KEY,
  owner_id     NVARCHAR(64) NULL,
  ticket_id    NVARCHAR(64) NULL,
  service_type NVARCHAR(64) NULL,
  description  NVARCHAR(MAX) NULL,
  cost_price   NVARCHAR(64) NULL,
  sale_price   NVARCHAR(64) NULL,
  created_at   NVARCHAR(64) NULL
);
CREATE INDEX IX_ticket_services_ticket ON ticket_services(ticket_id);
GO

-- ============================================================
-- PAYMENTS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'payments')
CREATE TABLE payments (
  id          NVARCHAR(64) NOT NULL PRIMARY KEY,
  owner_id    NVARCHAR(64) NULL,
  party_type  NVARCHAR(32) NULL,
  party_id    NVARCHAR(64) NULL,
  direction   NVARCHAR(8)  NULL,   -- 'in' | 'out'
  amount      NVARCHAR(64) NULL,
  method      NVARCHAR(32) NULL,   -- 'cash' | 'bank' | 'credit'
  reference   NVARCHAR(128) NULL,
  ticket_id   NVARCHAR(64) NULL,
  notes       NVARCHAR(MAX) NULL,
  created_at  NVARCHAR(64) NULL
);
CREATE INDEX IX_payments_owner ON payments(owner_id);
CREATE INDEX IX_payments_party ON payments(party_type, party_id);
GO

-- ============================================================
-- REFUNDS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'refunds')
CREATE TABLE refunds (
  id                          NVARCHAR(64) NOT NULL PRIMARY KEY,
  owner_id                    NVARCHAR(64) NULL,
  ticket_id                   NVARCHAR(64) NULL,
  customer_refund_amount      NVARCHAR(64) NULL,
  supplier_retention_amount   NVARCHAR(64) NULL,
  supplier_refund_amount      NVARCHAR(64) NULL,
  notes                       NVARCHAR(MAX) NULL,
  created_at                  NVARCHAR(64) NULL
);
CREATE INDEX IX_refunds_ticket ON refunds(ticket_id);
GO

-- ============================================================
-- DONE. Re-run anytime — all blocks are idempotent.
-- ============================================================
