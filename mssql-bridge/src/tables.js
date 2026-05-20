// Which tables to sync, in which direction, and which column to use as
// the change watermark. Every table must have:
//   - `id`         text/uuid primary key
//   - `updated_at` (or `created_at`) timestamp that bumps on every write
//
// The bridge auto-creates the MSSQL tables on first run with NVARCHAR columns
// matching what Supabase returns. You can ALTER them later for stricter types.

export const TABLES = [
  { name: "customers",         watermark: "created_at" },
  { name: "suppliers",         watermark: "created_at" },
  { name: "sub_agents",        watermark: "created_at" },
  { name: "tickets",           watermark: "created_at" },
  { name: "ticket_services",   watermark: "created_at" },
  { name: "payments",          watermark: "created_at" },
  { name: "refunds",           watermark: "created_at" },
  { name: "agency_profile",    watermark: "updated_at" },
];
