// Which tables to sync, in which direction, and which column to use as
// the change watermark. Every table must have:
//   - `id`         text/uuid primary key
//   - `updated_at` (or `created_at`) timestamp that bumps on every write
//
// The bridge auto-creates the MSSQL tables on first run with NVARCHAR columns
// matching what Supabase returns. You can ALTER them later for stricter types.

export const TABLES = [
  { name: "customers",         watermark: "updated_at" },
  { name: "suppliers",         watermark: "updated_at" },
  { name: "sub_agents",        watermark: "updated_at" },
  { name: "tickets",           watermark: "updated_at" },
  { name: "ticket_services",   watermark: "updated_at" },
  { name: "payments",          watermark: "updated_at" },
  { name: "refunds",           watermark: "updated_at" },
  { name: "agency_profile",    watermark: "updated_at" },
];
