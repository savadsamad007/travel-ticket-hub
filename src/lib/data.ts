import { supabase } from "./supabase";

export type PartyType = "supplier" | "sub_agent" | "customer";

export type Party = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  opening_balance?: number;
  notes: string | null;
  created_at: string;
};

export type Ticket = {
  id: string;
  ticket_no: string | null;
  pnr: string | null;
  passenger_name: string;
  route: string | null;
  travel_date: string | null;
  airline: string | null;
  supplier_id: string | null;
  buyer_type: "customer" | "sub_agent";
  buyer_id: string;
  cost_price: number;
  sale_price: number;
  status: "booked" | "paid" | "refunded" | "cancelled";
  notes: string | null;
  created_at: string;
};

export type TicketService = {
  id: string;
  ticket_id: string;
  service_type: string;
  description: string | null;
  cost_price: number;
  sale_price: number;
  created_at: string;
};

export type Payment = {
  id: string;
  party_type: PartyType;
  party_id: string;
  direction: "in" | "out";
  amount: number;
  method: "cash" | "bank" | "credit";
  reference: string | null;
  ticket_id: string | null;
  notes: string | null;
  created_at: string;
};

export type Refund = {
  id: string;
  ticket_id: string;
  customer_refund_amount: number;
  supplier_retention_amount: number;
  supplier_refund_amount: number;
  notes: string | null;
  created_at: string;
};

export const PARTY_TABLES: Record<PartyType, "suppliers" | "sub_agents" | "customers"> = {
  supplier: "suppliers",
  sub_agent: "sub_agents",
  customer: "customers",
};

export async function getOwnerId() {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("Not signed in");
  return id;
}

/**
 * Computes net balance for a party from opening balance + tickets + services + payments + refunds.
 *
 *  For SUPPLIERS (we OWE them when positive):
 *    + cost of every ticket bought from them
 *    + cost of every add-on service
 *    - supplier_retention_amount (refund — they keep this)
 *    - supplier_refund_amount    (refund — they return this to us)
 *    - payments out to supplier  (we paid them)
 *    + payments in from supplier (rare — they paid us, e.g. refund)
 *
 *  For CUSTOMERS / SUB-AGENTS (they OWE us when positive):
 *    + sale_price of tickets sold to them
 *    + sale_price of add-on services
 *    - customer_refund_amount (we returned this to them)
 *    - payments in from them
 *    + payments out to them
 */
export async function computePartyBalance(party_type: PartyType, party_id: string) {
  let balance = 0;

  // opening balance
  if (party_type !== "customer") {
    const { data } = await supabase
      .from(PARTY_TABLES[party_type])
      .select("opening_balance")
      .eq("id", party_id)
      .maybeSingle();
    balance += Number((data as any)?.opening_balance ?? 0);
  }

  if (party_type === "supplier") {
    const { data: tickets } = await supabase
      .from("tickets")
      .select("id, cost_price")
      .eq("supplier_id", party_id);
    const ticketIds = (tickets ?? []).map((t: any) => t.id);
    balance += (tickets ?? []).reduce((s: number, t: any) => s + Number(t.cost_price), 0);

    if (ticketIds.length) {
      const { data: svcs } = await supabase
        .from("ticket_services").select("cost_price").in("ticket_id", ticketIds);
      balance += (svcs ?? []).reduce((s: number, x: any) => s + Number(x.cost_price), 0);

      const { data: refs } = await supabase
        .from("refunds")
        .select("supplier_retention_amount, supplier_refund_amount")
        .in("ticket_id", ticketIds);
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
      .eq("buyer_id", party_id);
    const ticketIds = (tickets ?? []).map((t: any) => t.id);
    balance += (tickets ?? []).reduce((s: number, t: any) => s + Number(t.sale_price), 0);

    if (ticketIds.length) {
      const { data: svcs } = await supabase
        .from("ticket_services").select("sale_price").in("ticket_id", ticketIds);
      balance += (svcs ?? []).reduce((s: number, x: any) => s + Number(x.sale_price), 0);

      const { data: refs } = await supabase
        .from("refunds").select("customer_refund_amount").in("ticket_id", ticketIds);
      balance -= (refs ?? []).reduce((s: number, x: any) => s + Number(x.customer_refund_amount), 0);
    }
  }

  const { data: pays } = await supabase
    .from("payments")
    .select("direction, amount")
    .eq("party_type", party_type)
    .eq("party_id", party_id);
  for (const p of pays ?? []) {
    if (party_type === "supplier") {
      // out = we paid them => reduces our liability
      balance += p.direction === "in" ? Number(p.amount) : -Number(p.amount);
    } else {
      // in from customer/sub-agent = paid us => reduces their debt
      balance += p.direction === "out" ? Number(p.amount) : -Number(p.amount);
    }
  }

  return balance;
}
