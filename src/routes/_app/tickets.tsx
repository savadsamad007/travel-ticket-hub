import { RequirePerm } from "@/components/skybird/require-perm";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Receipt, X, FileText, MessageCircle, Search } from "lucide-react";
import { supabase, fmt } from "@/lib/supabase";
import { getOwnerId } from "@/lib/data";
import { useAuth, useIsAdmin } from "@/lib/auth";
import { formatRoute } from "@/lib/format";
import { buildTicketInvoice } from "@/lib/pdf";
import { openWhatsApp } from "@/lib/whatsapp";
import { toast } from "sonner";
import { PageHeader } from "@/components/skybird/ui";
import { AirlineAutocomplete } from "@/components/skybird/airline-autocomplete";
import { QuickAddCustomer } from "@/components/skybird/quick-add-customer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_app/tickets")({
  component: () => (<RequirePerm perm="tickets"><TicketsPage /></RequirePerm>),
});

type SvcRow = { service_type: string; description: string; cost_price: string; sale_price: string };

type Form = {
  is_service_only: boolean;
  ticket_no: string; pnr: string; passenger_name: string; route: string; travel_date: string; booking_date: string;
  airline: string; supplier_id: string; buyer_type: "customer" | "sub_agent"; buyer_id: string;
  walking_customer: boolean; walking_name: string; walking_phone: string;
  passenger_same_as_customer: boolean;
  cost_price: string; sale_price: string; status: "booked"|"paid"|"refunded"|"cancelled"; notes: string;
  services: SvcRow[];
};
function todayISO() { return new Date().toISOString().slice(0, 10); }
const emptyForm: Form = {
  is_service_only: false,
  ticket_no: "", pnr: "", passenger_name: "", route: "", travel_date: "", booking_date: todayISO(), airline: "",
  supplier_id: "", buyer_type: "customer", buyer_id: "",
  walking_customer: false, walking_name: "", walking_phone: "",
  passenger_same_as_customer: false,
  cost_price: "0", sale_price: "0", status: "booked", notes: "", services: [],
};

const SERVICE_TYPES = [
  { v: "addon_luggage", l: "Add-on luggage" },
  { v: "seat_selection", l: "Seat selection" },
  { v: "meal", l: "Meal" },
  { v: "date_change", l: "Date change" },
  { v: "insurance", l: "Insurance" },
  { v: "visa", l: "Visa assistance" },
  { v: "other", l: "Other" },
];

function TicketsPage() {
  const isAdmin = useIsAdmin();
  const { agencyProfile } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [services, setServices] = useState<Record<string, any[]>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [search, setSearch] = useState("");

  // standalone service modal (on existing tickets)
  const [svcOpen, setSvcOpen] = useState(false);
  const [svcTicket, setSvcTicket] = useState<any | null>(null);
  const [svcForm, setSvcForm] = useState({ service_type: "addon_luggage", description: "", cost_price: "0", sale_price: "0" });

  async function load() {
    const [tk, sp, cu, ag] = await Promise.all([
      supabase.from("tickets").select("*").eq("is_deleted", false).order("created_at", { ascending: false }),
      supabase.from("suppliers").select("*").eq("is_deleted", false).order("name"),
      supabase.from("customers").select("id, name").eq("is_deleted", false),
      supabase.from("sub_agents").select("id, name").eq("is_deleted", false),
    ]);
    if (sp.error) toast.error("Suppliers: " + sp.error.message);
    setTickets(tk.data ?? []);
    setSuppliers(sp.data ?? []); setCustomers(cu.data ?? []); setAgents(ag.data ?? []);
    if ((tk.data ?? []).length) {
      const { data: svs } = await supabase.from("ticket_services").select("*").eq("is_deleted", false).in("ticket_id", tk.data!.map((t: any) => t.id));
      const map: Record<string, any[]> = {};
      for (const s of svs ?? []) (map[s.ticket_id] ||= []).push(s);
      setServices(map);
    } else setServices({});
  }
  useEffect(() => { load(); }, []);

  const buyerOptions = form.buyer_type === "customer" ? customers : agents;
  const profit = useMemo(() => Number(form.sale_price || 0) - Number(form.cost_price || 0), [form.cost_price, form.sale_price]);

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((t) => {
      const buyer = (t.buyer_type === "customer" ? customers : agents).find((x: any) => x.id === t.buyer_id);
      const hay = [t.ticket_no, t.passenger_name, t.pnr, t.route, t.airline, buyer?.name, buyer?.phone]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [tickets, search, customers, agents]);

  function nameOf(arr: any[], id: string | null) { return arr.find((x) => x.id === id)?.name ?? "—"; }
  function buyerName(t: any) { return nameOf(t.buyer_type === "customer" ? customers : agents, t.buyer_id); }
  function svcTotal(id: string, k: "cost_price" | "sale_price") {
    return (services[id] ?? []).reduce((s, x) => s + Number(x[k]), 0);
  }

  function addSvcRow() {
    setForm((f) => ({ ...f, services: [...f.services, { service_type: "addon_luggage", description: "", cost_price: "0", sale_price: "0" }] }));
  }
  function updateSvcRow(idx: number, patch: Partial<SvcRow>) {
    setForm((f) => ({ ...f, services: f.services.map((s, i) => i === idx ? { ...s, ...patch } : s) }));
  }
  function removeSvcRow(idx: number) {
    setForm((f) => ({ ...f, services: f.services.filter((_, i) => i !== idx) }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplier_id) return toast.error("Pick a supplier (or Cash in Hand / Bank)");
    if (!form.walking_customer && !form.buyer_id) return toast.error("Pick a buyer (or toggle Walking customer)");
    if (form.walking_customer && !form.walking_name.trim()) return toast.error("Enter walking customer name");
    try {
      const owner_id = await getOwnerId();

      // Walking customer → upsert into customers, then use that id as buyer
      let buyer_id = form.buyer_id;
      let buyer_type = form.buyer_type;
      if (form.walking_customer) {
        const { data: newCust, error: cErr } = await supabase
          .from("customers")
          .insert({
            owner_id,
            name: form.walking_name.trim(),
            phone: form.walking_phone || null,
            is_walk_in: true,
          })
          .select("id, name, phone")
          .single();
        if (cErr) throw cErr;
        buyer_id = newCust.id;
        buyer_type = "customer";
        setCustomers((cs) => [newCust as any, ...cs]);
      }

      const payload: any = {
        ticket_no: form.ticket_no || null, pnr: form.pnr || null,
        passenger_name: form.passenger_name.trim(), route: form.route || null,
        travel_date: form.travel_date || null,
        booking_date: form.booking_date || todayISO(),
        airline: form.airline || null,
        supplier_id: form.supplier_id,
        buyer_type, buyer_id,
        cost_price: form.is_service_only ? 0 : Number(form.cost_price || 0),
        sale_price: form.is_service_only ? 0 : Number(form.sale_price || 0),
        status: form.status, notes: form.notes || null,
        is_service_only: form.is_service_only,
      };
      let ticketId: string;
      if (editing) {
        const { error } = await supabase.from("tickets").update(payload).eq("id", editing.id);
        if (error) throw error;
        ticketId = editing.id;
        toast.success("Ticket updated");
      } else {
        const { data, error } = await supabase.from("tickets").insert({ ...payload, owner_id }).select("id").single();
        if (error) throw error;
        ticketId = data.id;
        toast.success("Ticket created");

        // Virtual supplier (Cash / Bank) → auto-record a payment-out so cash book reflects it
        const sup = suppliers.find((s) => s.id === payload.supplier_id);
        if (sup && (sup.kind === "cash" || sup.kind === "bank") && Number(payload.cost_price) > 0) {
          const { error: payErr } = await supabase.from("payments").insert({
            owner_id, party_type: "supplier", party_id: sup.id,
            direction: "out", amount: Number(payload.cost_price),
            method: sup.kind, reference: `Ticket ${form.ticket_no || ticketId.slice(0, 8)}`,
            ticket_id: ticketId, notes: "Auto: ticket bought from local market",
          });
          if (payErr) toast.error("Ticket saved, but cash entry failed: " + payErr.message);
        }
      }
      // insert new services from form (only on create — edit keeps existing services unchanged)
      if (!editing && form.services.length) {
        const rows = form.services
          .filter((s) => Number(s.sale_price) > 0 || Number(s.cost_price) > 0)
          .map((s) => ({
            owner_id, ticket_id: ticketId,
            service_type: s.service_type,
            description: s.description || null,
            cost_price: Number(s.cost_price || 0),
            sale_price: Number(s.sale_price || 0),
          }));
        if (rows.length) {
          const { error } = await supabase.from("ticket_services").insert(rows);
          if (error) throw error;
        }
      }
      setOpen(false); setEditing(null); setForm(emptyForm); load();
    } catch (e: any) { toast.error(e.message); }
  }

  function startEdit(t: any) {
    setEditing(t);
    setForm({
      is_service_only: !!t.is_service_only,
      ticket_no: t.ticket_no ?? "", pnr: t.pnr ?? "", passenger_name: t.passenger_name,
      route: t.route ?? "", travel_date: t.travel_date ?? "",
      booking_date: t.booking_date ?? todayISO(),
      airline: t.airline ?? "",
      supplier_id: t.supplier_id ?? "", buyer_type: t.buyer_type, buyer_id: t.buyer_id,
      walking_customer: false, walking_name: "", walking_phone: "",
      passenger_same_as_customer: false,
      cost_price: String(t.cost_price), sale_price: String(t.sale_price),
      status: t.status, notes: t.notes ?? "", services: [],
    });
    setOpen(true);
  }

  async function remove(id: string) {
    if (!confirm("Delete this ticket and its services?")) return;
    const { error } = await supabase.rpc("soft_delete", { _table: "tickets", _id: id });
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  }

  async function addService(e: React.FormEvent) {
    e.preventDefault();
    if (!svcTicket) return;
    try {
      const owner_id = await getOwnerId();
      const { error } = await supabase.from("ticket_services").insert({
        owner_id, ticket_id: svcTicket.id,
        service_type: svcForm.service_type,
        description: svcForm.description || null,
        cost_price: Number(svcForm.cost_price || 0),
        sale_price: Number(svcForm.sale_price || 0),
      });
      if (error) throw error;
      toast.success("Service added");
      setSvcOpen(false); setSvcForm({ service_type: "addon_luggage", description: "", cost_price: "0", sale_price: "0" });
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  const statusTone: Record<string, string> = {
    booked: "bg-info text-info-foreground",
    paid: "bg-success text-success-foreground",
    refunded: "bg-warning text-warning-foreground",
    cancelled: "bg-destructive text-destructive-foreground",
  };

  return (
    <div>
      <PageHeader title="Tickets" description="Create & manage ticket sales and add-on services.">
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-brand text-white shadow-glow"><Plus className="h-4 w-4 mr-1" /> New ticket</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} ticket</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 px-3 py-2">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.walking_customer}
                    onCheckedChange={(v) => setForm({ ...form, walking_customer: v, buyer_id: v ? "" : form.buyer_id })} />
                  <span className="font-medium">Walking customer</span>
                  <span className="text-xs text-muted-foreground">(no account — just name + phone)</span>
                </label>
                <span className="text-muted-foreground/40">|</span>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.is_service_only}
                    onCheckedChange={(v) => setForm({ ...form, is_service_only: v, cost_price: v ? "0" : form.cost_price, sale_price: v ? "0" : form.sale_price })} />
                  <span className="font-medium">Service-only</span>
                  <span className="text-xs text-muted-foreground">(no airfare — just add-ons)</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Ticket no</Label><Input value={form.ticket_no} maxLength={50} onChange={(e) => setForm({ ...form, ticket_no: e.target.value })} /></div>
                <div className="space-y-2"><Label>PNR</Label><Input value={form.pnr} maxLength={20} onChange={(e) => setForm({ ...form, pnr: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Passenger name *</Label><Input required maxLength={120} value={form.passenger_name} readOnly={form.passenger_same_as_customer && form.buyer_type === "customer" && !form.walking_customer} onChange={(e) => setForm({ ...form, passenger_name: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Route <span className="text-xs text-muted-foreground">(auto-/ every 3 letters)</span></Label>
                  <Input
                    placeholder="RUH/JED/COK"
                    value={form.route}
                    maxLength={30}
                    onChange={(e) => setForm({ ...form, route: formatRoute(e.target.value) })}
                  />
                </div>
                <div className="space-y-2"><Label>Booking date</Label><Input type="date" value={form.booking_date} onChange={(e) => setForm({ ...form, booking_date: e.target.value })} /></div>
                <div className="space-y-2"><Label>Travel date</Label><Input type="date" value={form.travel_date} onChange={(e) => setForm({ ...form, travel_date: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Airline <span className="text-xs text-muted-foreground">(type code e.g. SV)</span></Label>
                  <AirlineAutocomplete value={form.airline} onChange={(v) => setForm({ ...form, airline: v })} />
                </div>
                <div className="space-y-2">
                  <Label>Paid to / Supplier *</Label>
                  <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose supplier or Cash/Bank…" /></SelectTrigger>
                    <SelectContent>{suppliers.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No suppliers yet — add one in Suppliers page.</div>}
                    {(() => {
                      // dedupe by (kind, lowercased clean name) so old duplicates don't render twice
                      const seen = new Set<string>();
                      const clean = (n: string) => n.replace(/^[\p{Emoji}\s]+/u, "").trim();
                      return suppliers.filter((s) => {
                        const k = `${s.kind || "supplier"}::${clean(s.name).toLowerCase()}`;
                        if (seen.has(k)) return false;
                        seen.add(k); return true;
                      }).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.kind === "cash" ? "💵 " : s.kind === "bank" ? "🏦 " : ""}{clean(s.name)}
                        </SelectItem>
                      ));
                    })()}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Pick "Cash in Hand" / "Bank" for tickets bought from the local market — cost auto-deducts from that account.</p>
                </div>
              </div>

              {!form.walking_customer ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Buyer type</Label>
                    <Select value={form.buyer_type} onValueChange={(v: any) => setForm({ ...form, buyer_type: v, buyer_id: "" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer">Customer</SelectItem>
                        <SelectItem value="sub_agent">Sub-agent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Buyer *</Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Select value={form.buyer_id} onValueChange={(v) => {
                          const c = buyerOptions.find((x: any) => x.id === v);
                          setForm((f) => ({
                            ...f,
                            buyer_id: v,
                            passenger_name: f.passenger_same_as_customer && f.buyer_type === "customer" && c
                              ? c.name
                              : f.passenger_name,
                          }));
                        }}>
                          <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                          <SelectContent>{buyerOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {form.buyer_type === "customer" && (
                        <QuickAddCustomer onCreated={(c) => {
                          setCustomers((cs) => [c, ...cs]);
                          setForm((f) => ({
                            ...f,
                            buyer_id: c.id,
                            passenger_name: f.passenger_same_as_customer ? c.name : f.passenger_name,
                          }));
                        }} />
                      )}
                    </div>
                    {form.buyer_type === "customer" && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground mt-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.passenger_same_as_customer}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const c = customers.find((x) => x.id === form.buyer_id);
                            setForm((f) => ({
                              ...f,
                              passenger_same_as_customer: checked,
                              passenger_name: checked && c ? c.name : f.passenger_name,
                            }));
                          }}
                        />
                        Passenger name = customer name
                      </label>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Walking customer name *</Label><Input required maxLength={120} value={form.walking_name} onChange={(e) => setForm({ ...form, walking_name: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Phone</Label><Input maxLength={40} value={form.walking_phone} onChange={(e) => setForm({ ...form, walking_phone: e.target.value })} /></div>
                </div>
              )}
              {!form.is_service_only && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2"><Label>Cost (from supplier)</Label><Input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Sale price</Label><Input type="number" step="0.01" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} /></div>
                  {isAdmin && (
                    <div className="space-y-2">
                      <Label>Profit</Label>
                      <div className={`h-9 px-3 flex items-center rounded-md border bg-muted/40 font-semibold ${profit >= 0 ? "text-success" : "text-destructive"}`}>{fmt(profit)}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Add-on services editor */}
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Add-on services</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addSvcRow}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
                </div>
                {form.services.length === 0 && <div className="text-xs text-muted-foreground">No add-ons. Click "Add" for luggage, seat, meal, etc.</div>}
                {form.services.map((s, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                      <Select value={s.service_type} onValueChange={(v) => updateSvcRow(idx, { service_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{SERVICE_TYPES.map((x) => <SelectItem key={x.v} value={x.v}>{x.l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Input className="col-span-4" placeholder="Description" maxLength={120} value={s.description} onChange={(e) => updateSvcRow(idx, { description: e.target.value })} />
                    <Input className="col-span-2" type="number" step="0.01" placeholder="Cost" value={s.cost_price} onChange={(e) => updateSvcRow(idx, { cost_price: e.target.value })} />
                    <Input className="col-span-2" type="number" step="0.01" placeholder="Sale" value={s.sale_price} onChange={(e) => updateSvcRow(idx, { sale_price: e.target.value })} />
                    <Button type="button" size="icon" variant="ghost" className="col-span-1" onClick={() => removeSvcRow(idx)}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
                {editing && <div className="text-xs text-muted-foreground">Tip: existing services aren't shown here — use the receipt icon on the ticket row to add more.</div>}
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} maxLength={1000} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button type="submit" className="w-full bg-gradient-brand text-white">{editing ? "Save changes" : "Create ticket"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card className="shadow-soft p-3 mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search ticket no, passenger, PNR, route, airline, or buyer name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </Card>

      <Card className="shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Passenger / Route</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Buyer</TableHead>
              {isAdmin && <TableHead className="text-right">Cost</TableHead>}
              <TableHead className="text-right">Sale</TableHead>
              {isAdmin && <TableHead className="text-right">Profit</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead className="text-right w-40">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTickets.length === 0 && <TableRow><TableCell colSpan={isAdmin ? 8 : 6} className="text-center py-8 text-muted-foreground">{tickets.length === 0 ? "No tickets yet." : "No matches."}</TableCell></TableRow>}
            {filteredTickets.map((t) => {
              const totalCost = Number(t.cost_price) + svcTotal(t.id, "cost_price");
              const totalSale = Number(t.sale_price) + svcTotal(t.id, "sale_price");
              const p = totalSale - totalCost;
              return (
                <TableRow key={t.id} className="hover:bg-muted/40">
                  <TableCell>
                    <div className="font-medium flex items-center gap-2">
                      {t.passenger_name}
                      {t.is_service_only && <Badge variant="outline" className="text-[10px]">Service-only</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{t.route ?? "—"} {t.travel_date ? `· Travel ${t.travel_date}` : ""} {t.booking_date ? `· Booked ${t.booking_date}` : ""} {t.airline ? `· ${t.airline}` : ""}</div>
                    {(services[t.id] ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {services[t.id].map((s) => <Badge key={s.id} variant="outline" className="text-xs">+{s.service_type}</Badge>)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{t.supplier_id ? nameOf(suppliers, t.supplier_id) : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  <TableCell><div className="text-sm">{buyerName(t)}</div><div className="text-xs text-muted-foreground">{t.buyer_type === "customer" ? "Customer" : "Sub-agent"}</div></TableCell>
                  {isAdmin && <TableCell className="text-right">{fmt(totalCost)}</TableCell>}
                  <TableCell className="text-right font-medium">{fmt(totalSale)}</TableCell>
                  {isAdmin && <TableCell className={`text-right font-semibold ${p >= 0 ? "text-success" : "text-destructive"}`}>{fmt(p)}</TableCell>}
                  <TableCell><span className={`text-xs px-2 py-1 rounded-full ${statusTone[t.status]}`}>{t.status}</span></TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" title="Add service" onClick={() => { setSvcTicket(t); setSvcOpen(true); }}><Receipt className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title="Invoice PDF" onClick={() => {
                      const buyer = (t.buyer_type === "customer" ? customers : agents).find((x: any) => x.id === t.buyer_id);
                      buildTicketInvoice({
                        agency: agencyProfile ?? {}, ticket: t, services: services[t.id] ?? [],
                        buyer_name: buyer?.name ?? "—", buyer_phone: buyer?.phone, buyer_email: buyer?.email,
                      });
                    }}><FileText className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title="Share on WhatsApp" onClick={() => {
                      const buyer = (t.buyer_type === "customer" ? customers : agents).find((x: any) => x.id === t.buyer_id);
                      const totalSale = Number(t.sale_price) + svcTotal(t.id, "sale_price");
                      const text = `*${agencyProfile?.agency_name ?? "Skybird"}*\nInvoice ${t.ticket_no || t.id.slice(0,8).toUpperCase()}\nPassenger: ${t.passenger_name}\nRoute: ${t.route ?? "—"}${t.travel_date ? `\nTravel: ${t.travel_date}` : ""}${t.airline ? `\nAirline: ${t.airline}` : ""}${t.pnr ? `\nPNR: ${t.pnr}` : ""}\nTotal: ${fmt(totalSale)}`;
                      openWhatsApp(buyer?.phone, text);
                    }}><MessageCircle className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => startEdit(t)}><Pencil className="h-4 w-4" /></Button>
                    {isAdmin && <Button size="icon" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </Card>

      {/* Service dialog */}
      <Dialog open={svcOpen} onOpenChange={setSvcOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add service to ticket</DialogTitle></DialogHeader>
          {svcTicket && (
            <form onSubmit={addService} className="space-y-3">
              <div className="text-sm text-muted-foreground">Ticket: <span className="font-medium text-foreground">{svcTicket.passenger_name}</span></div>
              <div className="space-y-2">
                <Label>Service type</Label>
                <Select value={svcForm.service_type} onValueChange={(v) => setSvcForm({ ...svcForm, service_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SERVICE_TYPES.map((x) => <SelectItem key={x.v} value={x.v}>{x.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Description</Label><Input maxLength={200} value={svcForm.description} onChange={(e) => setSvcForm({ ...svcForm, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Cost</Label><Input type="number" step="0.01" value={svcForm.cost_price} onChange={(e) => setSvcForm({ ...svcForm, cost_price: e.target.value })} /></div>
                <div className="space-y-2"><Label>Sale</Label><Input type="number" step="0.01" value={svcForm.sale_price} onChange={(e) => setSvcForm({ ...svcForm, sale_price: e.target.value })} /></div>
              </div>
              <Button type="submit" className="w-full bg-gradient-brand text-white">Add service</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
