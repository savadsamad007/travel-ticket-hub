import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Receipt } from "lucide-react";
import { supabase, fmt } from "@/lib/supabase";
import { getOwnerId } from "@/lib/data";
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
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/tickets")({
  component: TicketsPage,
});

type Form = {
  ticket_no: string; pnr: string; passenger_name: string; route: string; travel_date: string;
  airline: string; supplier_id: string; buyer_type: "customer" | "sub_agent"; buyer_id: string;
  cost_price: string; sale_price: string; status: "booked"|"paid"|"refunded"|"cancelled"; notes: string;
};
const emptyForm: Form = {
  ticket_no: "", pnr: "", passenger_name: "", route: "", travel_date: "", airline: "",
  supplier_id: "", buyer_type: "customer", buyer_id: "",
  cost_price: "0", sale_price: "0", status: "booked", notes: "",
};

function TicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [services, setServices] = useState<Record<string, any[]>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);

  // service modal
  const [svcOpen, setSvcOpen] = useState(false);
  const [svcTicket, setSvcTicket] = useState<any | null>(null);
  const [svcForm, setSvcForm] = useState({ service_type: "addon_luggage", description: "", cost_price: "0", sale_price: "0" });

  async function load() {
    const [tk, sp, cu, ag] = await Promise.all([
      supabase.from("tickets").select("*").order("created_at", { ascending: false }),
      supabase.from("suppliers").select("id, name"),
      supabase.from("customers").select("id, name"),
      supabase.from("sub_agents").select("id, name"),
    ]);
    setTickets(tk.data ?? []);
    setSuppliers(sp.data ?? []); setCustomers(cu.data ?? []); setAgents(ag.data ?? []);
    if ((tk.data ?? []).length) {
      const { data: svs } = await supabase.from("ticket_services").select("*").in("ticket_id", tk.data!.map((t: any) => t.id));
      const map: Record<string, any[]> = {};
      for (const s of svs ?? []) (map[s.ticket_id] ||= []).push(s);
      setServices(map);
    } else setServices({});
  }
  useEffect(() => { load(); }, []);

  const buyerOptions = form.buyer_type === "customer" ? customers : agents;
  const profit = useMemo(() => Number(form.sale_price || 0) - Number(form.cost_price || 0), [form.cost_price, form.sale_price]);

  function nameOf(arr: any[], id: string | null) { return arr.find((x) => x.id === id)?.name ?? "—"; }
  function buyerName(t: any) { return nameOf(t.buyer_type === "customer" ? customers : agents, t.buyer_id); }
  function svcTotal(id: string, k: "cost_price" | "sale_price") {
    return (services[id] ?? []).reduce((s, x) => s + Number(x[k]), 0);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplier_id) return toast.error("Pick a supplier");
    if (!form.buyer_id) return toast.error("Pick a buyer");
    try {
      const owner_id = await getOwnerId();
      const payload = {
        ticket_no: form.ticket_no || null, pnr: form.pnr || null,
        passenger_name: form.passenger_name.trim(), route: form.route || null,
        travel_date: form.travel_date || null, airline: form.airline || null,
        supplier_id: form.supplier_id, buyer_type: form.buyer_type, buyer_id: form.buyer_id,
        cost_price: Number(form.cost_price || 0), sale_price: Number(form.sale_price || 0),
        status: form.status, notes: form.notes || null,
      };
      if (editing) {
        const { error } = await supabase.from("tickets").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Ticket updated");
      } else {
        const { error } = await supabase.from("tickets").insert({ ...payload, owner_id });
        if (error) throw error;
        toast.success("Ticket created");
      }
      setOpen(false); setEditing(null); setForm(emptyForm); load();
    } catch (e: any) { toast.error(e.message); }
  }

  function startEdit(t: any) {
    setEditing(t);
    setForm({
      ticket_no: t.ticket_no ?? "", pnr: t.pnr ?? "", passenger_name: t.passenger_name,
      route: t.route ?? "", travel_date: t.travel_date ?? "", airline: t.airline ?? "",
      supplier_id: t.supplier_id ?? "", buyer_type: t.buyer_type, buyer_id: t.buyer_id,
      cost_price: String(t.cost_price), sale_price: String(t.sale_price),
      status: t.status, notes: t.notes ?? "",
    });
    setOpen(true);
  }

  async function remove(id: string) {
    if (!confirm("Delete this ticket and its services?")) return;
    const { error } = await supabase.from("tickets").delete().eq("id", id);
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
      <PageHeader title="Tickets" description="Create & manage ticket sales.">
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-brand text-white shadow-glow"><Plus className="h-4 w-4 mr-1" /> New ticket</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} ticket</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Ticket no</Label><Input value={form.ticket_no} maxLength={50} onChange={(e) => setForm({ ...form, ticket_no: e.target.value })} /></div>
                <div className="space-y-2"><Label>PNR</Label><Input value={form.pnr} maxLength={20} onChange={(e) => setForm({ ...form, pnr: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Passenger name *</Label><Input required maxLength={120} value={form.passenger_name} onChange={(e) => setForm({ ...form, passenger_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Route</Label><Input placeholder="JED → DXB" value={form.route} maxLength={80} onChange={(e) => setForm({ ...form, route: e.target.value })} /></div>
                <div className="space-y-2"><Label>Travel date</Label><Input type="date" value={form.travel_date} onChange={(e) => setForm({ ...form, travel_date: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Airline</Label><Input value={form.airline} maxLength={50} onChange={(e) => setForm({ ...form, airline: e.target.value })} /></div>
                <div className="space-y-2">
                  <Label>Supplier *</Label>
                  <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
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
                  <Select value={form.buyer_id} onValueChange={(v) => setForm({ ...form, buyer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>{buyerOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2"><Label>Cost (from supplier)</Label><Input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} /></div>
                <div className="space-y-2"><Label>Sale price</Label><Input type="number" step="0.01" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} /></div>
                <div className="space-y-2">
                  <Label>Profit</Label>
                  <div className={`h-9 px-3 flex items-center rounded-md border bg-muted/40 font-semibold ${profit >= 0 ? "text-success" : "text-destructive"}`}>{fmt(profit)}</div>
                </div>
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

      <Card className="shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Passenger / Route</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Sale</TableHead>
              <TableHead className="text-right">Profit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right w-40">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No tickets yet.</TableCell></TableRow>}
            {tickets.map((t) => {
              const totalCost = Number(t.cost_price) + svcTotal(t.id, "cost_price");
              const totalSale = Number(t.sale_price) + svcTotal(t.id, "sale_price");
              const p = totalSale - totalCost;
              return (
                <TableRow key={t.id} className="hover:bg-muted/40">
                  <TableCell>
                    <div className="font-medium">{t.passenger_name}</div>
                    <div className="text-xs text-muted-foreground">{t.route ?? "—"} {t.travel_date ? `· ${t.travel_date}` : ""}</div>
                    {(services[t.id] ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {services[t.id].map((s) => <Badge key={s.id} variant="outline" className="text-xs">+{s.service_type}</Badge>)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{nameOf(suppliers, t.supplier_id)}</TableCell>
                  <TableCell><div className="text-sm">{buyerName(t)}</div><div className="text-xs text-muted-foreground">{t.buyer_type === "customer" ? "Customer" : "Sub-agent"}</div></TableCell>
                  <TableCell className="text-right">{fmt(totalCost)}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(totalSale)}</TableCell>
                  <TableCell className={`text-right font-semibold ${p >= 0 ? "text-success" : "text-destructive"}`}>{fmt(p)}</TableCell>
                  <TableCell><span className={`text-xs px-2 py-1 rounded-full ${statusTone[t.status]}`}>{t.status}</span></TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" title="Add service" onClick={() => { setSvcTicket(t); setSvcOpen(true); }}><Receipt className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => startEdit(t)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
                  <SelectContent>
                    <SelectItem value="addon_luggage">Add-on luggage</SelectItem>
                    <SelectItem value="date_change">Date change</SelectItem>
                    <SelectItem value="seat_selection">Seat selection</SelectItem>
                    <SelectItem value="meal">Meal</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
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
