export type AppRole = "super_admin" | "admin" | "salesman";

export type PermKey =
  | "tickets"
  | "refunds"
  | "payments"
  | "customers"
  | "suppliers"
  | "sub_agents"
  | "cash_book"
  | "reports"
  | "statements";

export type Permissions = Partial<Record<PermKey, boolean>>;
