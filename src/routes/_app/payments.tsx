import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, FileText, MessageCircle } from "lucide-react";
import { supabase, fmt } from "@/lib/supabase";
import { getOwnerId, type PartyType } from "@/lib/data";
import { useAuth, useIsAdmin } from "@/lib/auth";
import { RequirePerm } from "@/components/skybird/require-perm";
import { buildPaymentVoucher } from "@/lib/pdf";
import { openWhatsApp } from "@/lib/whatsapp";
import { toast } from "sonner";
import { PageHeader } from "@/components/skybird/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_app/payments")({
  component: () => (<RequirePerm perm="payments"><PaymentsPage /></RequirePerm>),
});

type PayMethod = "cash" | "bank" | "supplier" | "sub_agent";

function PaymentsPage() {
  const isAdmin = useIsAdmin();
  const { agencyProfile } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [svcByTicket, setSvcByTicket] = useState<Record<string, number>>({});
  const [paidByTicket, setPaidByTicket] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    party_type: "customer" as PartyType, party_id: "", direction: "in" as "in"|"out",
    amount: "", method: "cash" as PayMethod, method_party_id: "",
    reference: "", notes: "", ticket_id: "",
  });
  // Per-ticket allocation for customer/sub_agent direction=in
  const [alloc, setAlloc] = useState<Record<string, string>>({});

  async function load() {
    const [py, sp, cu, ag, tk, svc] = await Promise.all([
      supabase.from("payments").select("*").eq("is_deleted", false).order("created_at", { ascending: false }),
      supabase.from("suppliers").select("*").eq("is_deleted", false),
      supabase.from("customers").select("id,name,phone").eq("is_deleted", false),
      supabase.from("sub_agents").select("id,name,phone").eq("is_deleted", false),
      supabase.from("tickets").select("id, ticket_no, pnr, passenger_name, buyer_type, buyer_id, supplier_id, sale_price, status, booking_date, created_at, route").eq("is_deleted", false).order("created_at", { ascending: false }),
      supabase.from("ticket_services").select("ticket_id, sale_price").eq("is_deleted", false),
    ]);
    setRows(py.data ?? []); setSuppliers(sp.data ?? []); setCustomers(cu.data ?? []); setAgents(ag.data ?? []);
    setTickets(tk.data ?? []);

    const sv: Record<string, number> = {};
    for (const s of svc.data ?? []) sv[s.ticket_id] = (sv[s.ticket_id] ?? 0) + Number(s.sale_price ?? 0);
    setSvcByTicket(sv);

    const paid: Record<string, number> = {};
    for (const p of py.data ?? []) {
      if (!p.ticket_id) continue;
      if (p.direction !== "in") continue;
      if (p.party_type !== "customer" && p.party_type !== "sub_agent") continue;
      paid[p.ticket_id] = (paid[p.ticket_id] ?? 0) + Number(p.amount ?? 0);
    }
    setPaidByTicket(paid);
  }
  useEffect(() => { load(); }, []);

  // realSuppliers = excludes cash/bank virtual entries
  const realSuppliers = useMemo(() => suppliers.filter((s) => (s.kind ?? "supplier") === "supplier"), [suppliers]);

  // Compute per-ticket outstanding for the selected buyer party
  const partyTicketsOutstanding = useMemo(() => {
    if (!form.party_id) return [] as { t: any; total: number; paid: number; outstanding: number }[];
    if (form.party_type !== "customer" && form.party_type !== "sub_agent") return [];
    const relevant = tickets.filter((t) => t.buyer_type === form.party_type && t.buyer_id === form.party_id);
    return relevant.map((t) => {
      const total = Number(t.sale_price ?? 0) + (svcByTicket[t.id] ?? 0);
      const paid = paidByTicket[t.id] ?? 0;
      return { t, total, paid, outstanding: Math.max(0, total - paid) };
    });
  }, [form.party_id, form.party_type, tickets, svcByTicket, paidByTicket]);

  const openPartyTickets = useMemo(
    () => partyTicketsOutstanding.filter((x) => x.outstanding > 0.005),
    [partyTicketsOutstanding],
  );

  const partyBalance = useMemo(
    () => partyTicketsOutstanding.reduce((s, x) => s + x.outstanding, 0),
    [partyTicketsOutstanding],
  );

  const allocationEnabled = form.direction === "in" && (form.party_type === "customer" || form.party_type === "sub_agent") && !!form.party_id;

  const allocTotal = useMemo(
    () => Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0),
    [alloc],
  );

  // Party list — for customers with direction=in, show only those with pending > 0
  const buyerParties = useMemo(() => {
    if (form.party_type === "supplier") return realSuppliers;
    const arr = form.party_type === "sub_agent" ? agents : customers;
    if (form.direction !== "in") return arr;
    // filter to parties with any outstanding
    return arr.filter((p) => {
      const rel = tickets.filter((t) => t.buyer_type === form.party_type && t.buyer_id === p.id);
      const out = rel.reduce((s, t) => s + Math.max(0, Number(t.sale_price ?? 0) + (svcByTicket[t.id] ?? 0) - (paidByTicket[t.id] ?? 0)), 0);
      return out > 0.005;
    });
  }, [form.party_type, form.direction, realSuppliers, agents, customers, tickets, svcByTicket, paidByTicket]);

  const methodPartyList = useMemo(() => {
    if (form.method === "supplier") return realSuppliers;
    if (form.method === "sub_agent") return agents;
    return [];
  }, [form.method, realSuppliers, agents]);

  function partyName(t: PartyType, id: string) {
    const list = t === "supplier" ? suppliers : t === "sub_agent" ? agents : customers;
    return list.find((x) => x.id === id)?.name ?? "—";
  }

  const ticketById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const t of tickets) m[t.id] = t;
    return m;
  }, [tickets]);

  // Auto-allocate the entered amount across open tickets, oldest-first
  function autoAllocate() {
    let remaining = Number(form.amount || 0);
    const next: Record<string, string> = {};
    const list = [...openPartyTickets].sort((a, b) =>
      String(a.t.booking_date ?? a.t.created_at ?? "").localeCompare(String(b.t.booking_date ?? b.t.created_at ?? "")),
    );
    for (const x of list) {
      if (remaining <= 0.005) break;
      const take = Math.min(x.outstanding, remaining);
      if (take > 0) { next[x.t.id] = String(Number(take.toFixed(2))); remaining -= take; }
    }
    setAlloc(next);
  }

  function setAllocFor(id: string, v: string) { setAlloc((prev) => ({ ...prev, [id]: v })); }

  async function updateTicketStatus(ticket_id: string) {
    const tk = ticketById[ticket_id];
    if (!tk) return;
    if (tk.status !== "booked" && tk.status !== "partial" && tk.status) {
      // only auto-manage booked/partial → paid
      if (tk.status !== "paid") return;
    }
    const { data: svc } = await supabase.from("ticket_services").select("sale_price").eq("ticket_id", ticket_id).eq("is_deleted", false);
    const svcTotal = (svc ?? []).reduce((s: number, x: any) => s + Number(x.sale_price ?? 0), 0);
    const grandTotal = Number(tk.sale_price ?? 0) + svcTotal;
    const { data: paidRows } = await supabase.from("payments").select("amount, party_type").eq("ticket_id", ticket_id).eq("direction", "in").eq("is_deleted", false);
    const paidTotal = (paidRows ?? []).filter((r: any) => r.party_type === "customer" || r.party_type === "sub_agent").reduce((s: number, x: any) => s + Number(x.amount ?? 0), 0);
    const newStatus = paidTotal + 0.005 >= grandTotal ? "paid" : paidTotal > 0.005 ? "partial" : "booked";
    if (newStatus !== tk.status) {
      await supabase.from("tickets").update({ status: newStatus }).eq("id", ticket_id);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.party_id) return toast.error("Pick a party");
    if (!form.amount || Number(form.amount) <= 0) return toast.error("Enter an amount");
    if ((form.method === "supplier" || form.method === "sub_agent") && !form.method_party_id) {
      return toast.error("Pick which " + (form.method === "supplier" ? "supplier" : "sub-agent") + " received the money");
    }

    // Build allocations list
    const totalAmt = Number(form.amount);
    let allocations: { ticket_id: string | null; amount: number }[] = [];
    if (allocationEnabled) {
      const entries = Object.entries(alloc).map(([k, v]) => ({ ticket_id: k, amount: Number(v) || 0 })).filter((x) => x.amount > 0);
      if (entries.length === 0) {
        // Fall back to legacy single ticket_id if set, else unallocated
        allocations = [{ ticket_id: form.ticket_id || null, amount: totalAmt }];
      } else {
        const sum = entries.reduce((s, x) => s + x.amount, 0);
        if (Math.abs(sum - totalAmt) > 0.01) {
          return toast.error(`Allocation total ${fmt(sum)} does not match amount ${fmt(totalAmt)}`);
        }
        // Guard: not more than outstanding per ticket
        for (const e of entries) {
          const row = openPartyTickets.find((x) => x.t.id === e.ticket_id) ?? partyTicketsOutstanding.find((x) => x.t.id === e.ticket_id);
          if (row && e.amount > row.outstanding + 0.01) {
            return toast.error(`Allocation to #${row.t.ticket_no || row.t.id.slice(0,6)} exceeds outstanding (${fmt(row.outstanding)})`);
          }
        }
        allocations = entries;
      }
    } else {
      allocations = [{ ticket_id: form.ticket_id || null, amount: totalAmt }];
    }

    try {
      const owner_id = await getOwnerId();
      const created_at = form.date ? new Date(form.date).toISOString() : new Date().toISOString();
      const primaryMethod = (form.method === "supplier" || form.method === "sub_agent") ? "credit" : form.method;

      // Insert one payment row per allocation
      for (const a of allocations) {
        const { error } = await supabase.from("payments").insert({
          owner_id,
          party_type: form.party_type, party_id: form.party_id,
          direction: form.direction, amount: a.amount,
          method: primaryMethod, reference: form.reference || null, notes: form.notes || null,
          ticket_id: a.ticket_id, created_at,
        });
        if (error) throw error;
      }

      // Mirror: single lump-sum entry for the supplier/sub-agent method routing
      if (form.method === "supplier" || form.method === "sub_agent") {
        const mirrorType: PartyType = form.method === "supplier" ? "supplier" : "sub_agent";
        const mirrorDir: "in" | "out" = form.direction === "in" ? "out" : "in";
        if (form.method_party_id !== form.party_id) {
          await supabase.from("payments").insert({
            owner_id,
            party_type: mirrorType, party_id: form.method_party_id,
            direction: mirrorDir, amount: totalAmt, method: "credit",
            reference: form.reference || null,
            notes: `Auto-mirror: ${form.direction === "in" ? "received" : "paid"} via ${mirrorType === "supplier" ? "supplier " + partyName("supplier", form.method_party_id) : "sub-agent " + partyName("sub_agent", form.method_party_id)}`,
            ticket_id: null, created_at,
          });
        }
      }

      // Update statuses on all allocated tickets
      if (form.direction === "in" && (form.party_type === "customer" || form.party_type === "sub_agent")) {
        for (const a of allocations) if (a.ticket_id) await updateTicketStatus(a.ticket_id);
      }

      toast.success("Payment recorded");
      setOpen(false);
      setAlloc({});
      setForm({ date: new Date().toISOString().slice(0,10), party_type: "customer", party_id: "", direction: "in", amount: "", method: "cash", method_party_id: "", reference: "", notes: "", ticket_id: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this payment?")) return;
    const row = rows.find((r) => r.id === id);
    const { error } = await supabase.rpc("soft_delete", { _table: "payments", _id: id });
    if (error) return toast.error(error.message);
    if (row?.ticket_id) await updateTicketStatus(row.ticket_id);
    toast.success("Deleted"); load();
  }

  return (
    <div>
      <PageHeader title="Payments" description="Cash, bank & inter-party payments — in and out.">
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setAlloc({}); }}>
          <DialogTrigger asChild><Button className="bg-gradient-brand text-white shadow-glow"><Plus className="h-4 w-4 mr-1" /> New payment</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Direction</Label>
                  <Select value={form.direction} onValueChange={(v: any) => { setForm({ ...form, direction: v, party_id: "", ticket_id: "" }); setAlloc({}); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">Received (in)</SelectItem>
                      <SelectItem value="out">Paid (out)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Party type</Label>
                  <Select value={form.party_type} onValueChange={(v: any) => { setForm({ ...form, party_type: v, party_id: "", ticket_id: "" }); setAlloc({}); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="sub_agent">Sub-agent</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Party {form.direction === "in" && form.party_type !== "supplier" && <span className="text-xs text-muted-foreground">(only parties with pending balance)</span>}</Label>
                <Select value={form.party_id} onValueChange={(v) => { setForm({ ...form, party_id: v, ticket_id: "" }); setAlloc({}); }}>
                  <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                  <SelectContent>
                    {buyerParties.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No matching parties.</div>}
                    {buyerParties.map((p) => {
                      // Show pending balance for customer/sub_agent in-direction
                      let suffix = "";
                      if (form.direction === "in" && form.party_type !== "supplier") {
                        const rel = tickets.filter((t) => t.buyer_type === form.party_type && t.buyer_id === p.id);
                        const out = rel.reduce((s, t) => s + Math.max(0, Number(t.sale_price ?? 0) + (svcByTicket[t.id] ?? 0) - (paidByTicket[t.id] ?? 0)), 0);
                        if (out > 0.005) suffix = ` · Due ${fmt(out)}`;
                      }
                      return <SelectItem key={p.id} value={p.id}>{p.name}{suffix}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Amount (SAR)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select value={form.method} onValueChange={(v: PayMethod) => setForm({ ...form, method: v, method_party_id: "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">💵 Cash</SelectItem>
                      <SelectItem value="bank">🏦 Bank</SelectItem>
                      <SelectItem value="supplier">🏢 Supplier account</SelectItem>
                      <SelectItem value="sub_agent">🧑‍💼 Sub-agent account</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(form.method === "supplier" || form.method === "sub_agent") && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <Label>Which {form.method === "supplier" ? "supplier" : "sub-agent"} received the money? *</Label>
                  <Select value={form.method_party_id} onValueChange={(v) => setForm({ ...form, method_party_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>
                      {methodPartyList.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Their account balance will be adjusted automatically.</p>
                </div>
              )}

              {/* Allocation panel for customer / sub_agent receipts */}
              {allocationEnabled && (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Outstanding balance: <span className="text-warning">{fmt(partyBalance)}</span></div>
                      <div className="text-xs text-muted-foreground">Allocate this payment across pending tickets.</div>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={autoAllocate} disabled={!form.amount || Number(form.amount) <= 0}>Auto-allocate</Button>
                  </div>
                  {openPartyTickets.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No open tickets for this party.</div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Ticket</TableHead>
                            <TableHead>Passenger</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right">Pending</TableHead>
                            <TableHead className="text-right w-32">Pay now</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {openPartyTickets.map((x) => (
                            <TableRow key={x.t.id}>
                              <TableCell className="text-xs">{x.t.ticket_no ? `#${x.t.ticket_no}` : x.t.id.slice(0,6)}<div className="text-muted-foreground">{x.t.pnr ? `PNR ${x.t.pnr}` : ""}</div></TableCell>
                              <TableCell className="text-xs">{x.t.passenger_name}</TableCell>
                              <TableCell className="text-right text-xs">{fmt(x.total)}</TableCell>
                              <TableCell className="text-right text-xs font-semibold text-warning">{fmt(x.outstanding)}</TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number" step="0.01" min="0" max={x.outstanding}
                                  className="h-8 text-right"
                                  value={alloc[x.t.id] ?? ""}
                                  onChange={(e) => setAllocFor(x.t.id, e.target.value)}
                                  placeholder="0"
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <div className="text-muted-foreground">Allocated: <span className={`font-semibold ${Math.abs(allocTotal - Number(form.amount || 0)) < 0.01 ? "text-success" : "text-warning"}`}>{fmt(allocTotal)}</span> of {fmt(Number(form.amount || 0))}</div>
                    <div className="text-muted-foreground">Unallocated: {fmt(Math.max(0, Number(form.amount || 0) - allocTotal))}</div>
                  </div>
                </div>
              )}

              <div className="space-y-2"><Label>Reference</Label><Input maxLength={120} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
              <div className="space-y-2"><Label>Notes</Label><Textarea maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button type="submit" className="w-full bg-gradient-brand text-white">Record payment</Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card className="shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Ticket #</TableHead>
              <TableHead>Passenger</TableHead>
              <TableHead>PNR</TableHead>
              <TableHead className="text-right w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No payments yet.</TableCell></TableRow>}
            {rows.map((r) => {
              const tk = r.ticket_id ? ticketById[r.ticket_id] : null;
              return (
              <TableRow key={r.id} className="hover:bg-muted/40">
                <TableCell className="text-sm">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div>{partyName(r.party_type, r.party_id)}</div>
                  <div className="text-xs text-muted-foreground capitalize">{r.party_type.replace("_", "-")}</div>
                </TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-1 rounded-full ${r.direction === "in" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}`}>
                    {r.direction === "in" ? "Received" : "Paid out"}
                  </span>
                </TableCell>
                <TableCell className="capitalize">{r.method}</TableCell>
                <TableCell className={`text-right font-semibold ${r.direction === "in" ? "text-success" : "text-warning"}`}>{fmt(r.amount)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.reference ?? "—"}</TableCell>
                <TableCell className="text-sm">{tk?.ticket_no ?? "—"}</TableCell>
                <TableCell className="text-sm">{tk?.passenger_name ?? "—"}</TableCell>
                <TableCell className="text-sm">{tk?.pnr ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" title="Voucher PDF" onClick={() => {
                    const party = partyName(r.party_type, r.party_id);
                    buildPaymentVoucher({
                      agency: agencyProfile ?? {},
                      direction: r.direction, voucher_no: r.id.slice(0, 8).toUpperCase(),
                      date: r.created_at, party_name: party, party_type: r.party_type,
                      amount: Number(r.amount), method: r.method,
                      reference: r.reference, notes: r.notes,
                    });
                  }}><FileText className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Share on WhatsApp" onClick={() => {
                    const list = r.party_type === "supplier" ? suppliers : r.party_type === "sub_agent" ? agents : customers;
                    const p = list.find((x: any) => x.id === r.party_id);
                    const title = r.direction === "in" ? "Receipt" : "Payment";
                    const text = `*${agencyProfile?.agency_name ?? "Skybird"}*\n${title} Voucher\nVoucher: ${r.id.slice(0,8).toUpperCase()}\nDate: ${new Date(r.created_at).toLocaleDateString()}\n${r.direction === "in" ? "Received from" : "Paid to"}: ${partyName(r.party_type, r.party_id)}\nAmount: ${fmt(r.amount)}\nMethod: ${r.method}${r.reference ? `\nRef: ${r.reference}` : ""}${tk?.ticket_no ? `\nTicket: ${tk.ticket_no}` : ""}${tk?.pnr ? `\nPNR: ${tk.pnr}` : ""}`;
                    openWhatsApp(p?.phone, text);
                  }}><MessageCircle className="h-4 w-4" /></Button>
                  {isAdmin && <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </Card>
    </div>
  );
}
