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
  const [customerSummary, setCustomerSummary] = useState<Record<string, { ticket_no: string; pending: number }>>({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    party_type: "customer" as PartyType, party_id: "", direction: "in" as "in"|"out",
    amount: "", method: "cash" as PayMethod, method_party_id: "",
    reference: "", notes: "", ticket_id: "",
  });

  async function load() {
    const [py, sp, cu, ag, tk, svc] = await Promise.all([
      supabase.from("payments").select("*").eq("is_deleted", false).order("created_at", { ascending: false }),
      supabase.from("suppliers").select("*").eq("is_deleted", false),
      supabase.from("customers").select("id,name,phone").eq("is_deleted", false),
      supabase.from("sub_agents").select("id,name,phone").eq("is_deleted", false),
      supabase.from("tickets").select("id, ticket_no, pnr, passenger_name, buyer_type, buyer_id, sale_price, created_at").eq("is_deleted", false).order("created_at", { ascending: false }),
      supabase.from("ticket_services").select("ticket_id, sale_price").eq("is_deleted", false),
    ]);
    setRows(py.data ?? []); setSuppliers(sp.data ?? []); setCustomers(cu.data ?? []); setAgents(ag.data ?? []);
    setTickets(tk.data ?? []);
    // Pending per customer: sales - payments_in
    const svcByTicket: Record<string, number> = {};
    for (const s of svc.data ?? []) svcByTicket[s.ticket_id] = (svcByTicket[s.ticket_id] ?? 0) + Number(s.sale_price ?? 0);
    const sales: Record<string, number> = {};
    const latestTno: Record<string, string> = {};
    for (const t of tk.data ?? []) {
      if (t.buyer_type !== "customer") continue;
      sales[t.buyer_id] = (sales[t.buyer_id] ?? 0) + Number(t.sale_price ?? 0) + (svcByTicket[t.id] ?? 0);
      if (!latestTno[t.buyer_id] && t.ticket_no) latestTno[t.buyer_id] = t.ticket_no;
    }
    const paid: Record<string, number> = {};
    for (const p of py.data ?? []) {
      if (p.party_type === "customer" && p.direction === "in") {
        paid[p.party_id] = (paid[p.party_id] ?? 0) + Number(p.amount ?? 0);
      }
    }
    const sum: Record<string, { ticket_no: string; pending: number }> = {};
    for (const c of cu.data ?? []) {
      sum[c.id] = { ticket_no: latestTno[c.id] ?? "", pending: (sales[c.id] ?? 0) - (paid[c.id] ?? 0) };
    }
    setCustomerSummary(sum);
  }
  useEffect(() => { load(); }, []);

  // realSuppliers = excludes cash/bank virtual entries
  const realSuppliers = useMemo(() => suppliers.filter((s) => (s.kind ?? "supplier") === "supplier"), [suppliers]);

  // Party list — for customers with direction=in, show only those with pending > 0
  const parties = useMemo(() => {
    if (form.party_type === "supplier") return realSuppliers;
    if (form.party_type === "sub_agent") return agents;
    // customer: filter to only pending > 0 when direction=in
    if (form.direction === "in") {
      return customers.filter((c) => (customerSummary[c.id]?.pending ?? 0) > 0);
    }
    return customers;
  }, [form.party_type, form.direction, realSuppliers, agents, customers, customerSummary]);

  const methodPartyList = useMemo(() => {
    if (form.method === "supplier") return realSuppliers;
    if (form.method === "sub_agent") return agents;
    return [];
  }, [form.method, realSuppliers, agents]);

  // Tickets for currently selected party (to attach ticket to payment)
  const partyTickets = useMemo(() => {
    if (!form.party_id) return [] as any[];
    if (form.party_type === "supplier") return tickets.filter((t) => t.supplier_id === form.party_id);
    return tickets.filter((t) => t.buyer_type === form.party_type && t.buyer_id === form.party_id);
  }, [tickets, form.party_type, form.party_id]);

  function partyName(t: PartyType, id: string) {
    const list = t === "supplier" ? suppliers : t === "sub_agent" ? agents : customers;
    return list.find((x) => x.id === id)?.name ?? "—";
  }

  const ticketById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const t of tickets) m[t.id] = t;
    return m;
  }, [tickets]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.party_id) return toast.error("Pick a party");
    if (!form.amount || Number(form.amount) <= 0) return toast.error("Enter an amount");
    if ((form.method === "supplier" || form.method === "sub_agent") && !form.method_party_id) {
      return toast.error("Pick which " + (form.method === "supplier" ? "supplier" : "sub-agent") + " received the money");
    }
    try {
      const owner_id = await getOwnerId();
      const created_at = form.date ? new Date(form.date).toISOString() : new Date().toISOString();
      const amt = Number(form.amount);

      // Store method: if supplier/sub_agent routing, mark method as 'credit' on the primary row
      const primaryMethod = (form.method === "supplier" || form.method === "sub_agent") ? "credit" : form.method;

      const { error } = await supabase.from("payments").insert({
        owner_id,
        party_type: form.party_type, party_id: form.party_id,
        direction: form.direction, amount: amt,
        method: primaryMethod, reference: form.reference || null, notes: form.notes || null,
        ticket_id: form.ticket_id || null,
        created_at,
      });
      if (error) throw error;

      // Mirror entry so cash-in-hand / bank / supplier / sub-agent balances update
      let mirror: { party_type: PartyType; party_id: string; direction: "in" | "out" } | null = null;
      if (form.method === "cash" || form.method === "bank") {
        const virt = suppliers.find((s: any) => s.kind === form.method);
        if (virt) mirror = { party_type: "supplier", party_id: virt.id, direction: form.direction };
      } else if (form.method === "supplier") {
        // Money went to that supplier's account → they hold it → we owe them less (direction=out from our side)
        mirror = { party_type: "supplier", party_id: form.method_party_id, direction: form.direction === "in" ? "out" : "in" };
      } else if (form.method === "sub_agent") {
        mirror = { party_type: "sub_agent", party_id: form.method_party_id, direction: form.direction === "in" ? "out" : "in" };
      }
      if (mirror && mirror.party_id !== form.party_id) {
        await supabase.from("payments").insert({
          owner_id,
          party_type: mirror.party_type, party_id: mirror.party_id,
          direction: mirror.direction, amount: amt,
          method: (form.method === "cash" || form.method === "bank") ? form.method : "credit",
          reference: form.reference || null,
          notes: `Auto-mirror: ${form.direction === "in" ? "received" : "paid"} via ${form.method === "supplier" ? "supplier " + partyName("supplier", form.method_party_id) : form.method === "sub_agent" ? "sub-agent " + partyName("sub_agent", form.method_party_id) : form.method}`,
          ticket_id: form.ticket_id || null,
          created_at,
        });
      }

      // Auto-update ticket status when a customer pays against a specific ticket
      if (form.ticket_id && form.direction === "in" && form.party_type === "customer") {
        const tk = ticketById[form.ticket_id];
        if (tk && (tk.status === "booked" || tk.status === "partial" || !tk.status)) {
          // Compute ticket grand total = sale_price + sum(ticket_services.sale_price)
          const { data: svc } = await supabase
            .from("ticket_services").select("sale_price")
            .eq("ticket_id", form.ticket_id).eq("is_deleted", false);
          const svcTotal = (svc ?? []).reduce((s: number, x: any) => s + Number(x.sale_price ?? 0), 0);
          const grandTotal = Number(tk.sale_price ?? 0) + svcTotal;
          // Sum all customer-in payments linked to this ticket (including the one we just inserted)
          const { data: paidRows } = await supabase
            .from("payments").select("amount")
            .eq("ticket_id", form.ticket_id).eq("party_type", "customer")
            .eq("direction", "in").eq("is_deleted", false);
          const paidTotal = (paidRows ?? []).reduce((s: number, x: any) => s + Number(x.amount ?? 0), 0);
          const newStatus = paidTotal + 0.005 >= grandTotal ? "paid" : paidTotal > 0 ? "partial" : tk.status;
          if (newStatus !== tk.status) {
            await supabase.from("tickets").update({ status: newStatus }).eq("id", form.ticket_id);
          }
        }
      }

      toast.success("Payment recorded");
      setOpen(false);
      setForm({ date: new Date().toISOString().slice(0,10), party_type: "customer", party_id: "", direction: "in", amount: "", method: "cash", method_party_id: "", reference: "", notes: "", ticket_id: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this payment?")) return;
    const { error } = await supabase.rpc("soft_delete", { _table: "payments", _id: id });
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  }

  return (
    <div>
      <PageHeader title="Payments" description="Cash, bank & inter-party payments — in and out.">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-gradient-brand text-white shadow-glow"><Plus className="h-4 w-4 mr-1" /> New payment</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Direction</Label>
                  <Select value={form.direction} onValueChange={(v: any) => setForm({ ...form, direction: v, party_id: "", ticket_id: "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">Received (in)</SelectItem>
                      <SelectItem value="out">Paid (out)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Party type</Label>
                  <Select value={form.party_type} onValueChange={(v: any) => setForm({ ...form, party_type: v, party_id: "", ticket_id: "" })}>
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
                <Label>Party {form.party_type === "customer" && form.direction === "in" && <span className="text-xs text-muted-foreground">(only customers with pending amount)</span>}</Label>
                <Select value={form.party_id} onValueChange={(v) => setForm({ ...form, party_id: v, ticket_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                  <SelectContent>
                    {parties.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No matching parties.</div>}
                    {parties.map((p) => {
                      const s = form.party_type === "customer" ? customerSummary[p.id] : null;
                      const suffix = s
                        ? ` ${s.ticket_no ? `· T#${s.ticket_no}` : ""}${s.pending > 0 ? ` · Due ${fmt(s.pending)}` : ""}`
                        : "";
                      return <SelectItem key={p.id} value={p.id}>{p.name}{suffix}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              {form.party_id && partyTickets.length > 0 && (
                <div className="space-y-2">
                  <Label>Ticket (optional)</Label>
                  <Select value={form.ticket_id || "none"} onValueChange={(v) => setForm({ ...form, ticket_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Link to a ticket…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— none —</SelectItem>
                      {partyTickets.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.ticket_no ? `#${t.ticket_no}` : t.id.slice(0,6)} · {t.passenger_name} {t.pnr ? `· PNR ${t.pnr}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
