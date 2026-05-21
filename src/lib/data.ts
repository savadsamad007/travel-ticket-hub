import { supabase } from "./supabase";
import { ensureSupabaseSession } from "./supabase-session";

export type PartyType = "supplier" | "sub_agent" | "customer";

export const PARTY_TABLES: Record<PartyType, "suppliers" | "sub_agents" | "customers"> = {
  supplier: "suppliers",
  sub_agent: "sub_agents",
  customer: "customers",
};

/**
 * Returns the agency_owner UUID — used as owner_id on every insert.
 * Staff (salesman) get the admin's UUID so all data is shared in the agency.
 */
export async function getOwnerId(): Promise<string> {
  const user = await ensureSupabaseSession();
  const uid = user.id;
  const { data } = await supabase
    .from("user_agency")
    .select("agency_owner")
    .eq("user_id", uid)
      .eq("is_deleted", false)
    .maybeSingle();
  return data?.agency_owner ?? uid;
}

/**
 * Net balance — see previous version for formula docs.
 */
export async function computePartyBalance(party_type: PartyType, party_id: string) {
  let balance = 0;

  if (party_type !== "customer") {
    const { data } = await supabase
      .from(PARTY_TABLES[party_type])
      .select("opening_balance")
      .eq("id", party_id)
      .eq("is_deleted", false)
      .maybeSingle();
    balance += Number((data as any)?.opening_balance ?? 0);
  }

  if (party_type === "supplier") {
    const { data: tickets } = await supabase
      .from("tickets")
      .select("id, cost_price")
      .eq("supplier_id", party_id)
      .eq("is_deleted", false);
    const ticketIds = (tickets ?? []).map((t: any) => t.id);
    balance += (tickets ?? []).reduce((s: number, t: any) => s + Number(t.cost_price), 0);

    if (ticketIds.length) {
      const { data: svcs } = await supabase
        .from("ticket_services")
        .select("cost_price")
        .in("ticket_id", ticketIds)
        .eq("is_deleted", false);
      balance += (svcs ?? []).reduce((s: number, x: any) => s + Number(x.cost_price), 0);

      const { data: refs } = await supabase
        .from("refunds")
        .select("supplier_retention_amount, supplier_refund_amount")
        .in("ticket_id", ticketIds)
        .eq("is_deleted", false);
      for (const r of refs ?? []) {
        balance -= Number((r as any).supplier_retention_amount);
        balance -= Number((r as any).supplier_refund_amount);
      }
    }
  } else {
    const { data: tickets } = await supabase
      .from("tickets")
      .select("id, sale_price")
      .eq("buyer_type", party_type)
      .eq("buyer_id", party_id)
      .eq("is_deleted", false);
    const ticketIds = (tickets ?? []).map((t: any) => t.id);
    balance += (tickets ?? []).reduce((s: number, t: any) => s + Number(t.sale_price), 0);

    if (ticketIds.length) {
      const { data: svcs } = await supabase
        .from("ticket_services")
        .select("sale_price")
        .in("ticket_id", ticketIds)
        .eq("is_deleted", false);
      balance += (svcs ?? []).reduce((s: number, x: any) => s + Number(x.sale_price), 0);

      const { data: refs } = await supabase
        .from("refunds")
        .select("customer_refund_amount")
        .in("ticket_id", ticketIds)
        .eq("is_deleted", false);
      balance -= (refs ?? []).reduce(
        (s: number, x: any) => s + Number(x.customer_refund_amount),
        0,
      );
    }
  }

  const { data: pays } = await supabase
    .from("payments")
    .select("direction, amount")
    .eq("party_type", party_type)
    .eq("party_id", party_id)
    .eq("is_deleted", false);
  for (const p of pays ?? []) {
    if (party_type === "supplier") {
      balance += p.direction === "in" ? Number(p.amount) : -Number(p.amount);
    } else {
      balance += p.direction === "out" ? Number(p.amount) : -Number(p.amount);
    }
  }

  return balance;
}
