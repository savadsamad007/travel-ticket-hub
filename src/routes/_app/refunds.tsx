import { RequirePerm } from "@/components/skybird/require-perm";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import { supabase, fmt } from "@/lib/supabase";
import { getOwnerId } from "@/lib/data";
import { useIsAdmin } from "@/lib/auth";
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

export const Route = createFileRoute("/_app/refunds")({
  component: () => (<RequirePerm perm="refunds"><RefundsPage /></RequirePerm>),
});

function RefundsPage() {
  const isAdmin = useIsAdmin();
  const [rows, setRows] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    ticket_id: "", customer_refund_amount: "0",
    supplier_retention_amount: "0", supplier_refund_amount: "0", notes: "",
  });

  async function load() {
    const [rf, tk, cu, ag] = await Promise.all([
      supabase.from("refunds").select("*").eq("is_deleted", false).order("created_at", { ascending: false }),
      supabase.from("tickets").select("id, ticket_no, pnr, passenger_name, route, sale_price, cost_price, status, buyer_type, buyer_id").eq("is_deleted", false),
      supabase.from("customers").select("id, name, phone").eq("is_deleted", false),
      supabase.from("sub_agents").select("id, name, phone").eq("is_deleted", false),
    ]);
    setRows(rf.data ?? []); setTickets(tk.data ?? []);
    setCustomers(cu.data ?? []); setAgents(ag.data ?? []);
  }
  useEffect(() => { load(); }, []);

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((t) => {
      const buyer = (t.buyer_type === "customer" ? customers : agents).find((x: any) => x.id === t.buyer_id);
      const hay = [t.ticket_no, t.passenger_name, t.pnr, t.route, buyer?.name, buyer?.phone]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [tickets, customers, agents, search]);

  const selected = tickets.find((t) => t.id === form.ticket_id);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.ticket_id) return toast.error("Pick a ticket");
    try {
      const owner_id = await getOwnerId();
      const { error } = await supabase.from("refunds").insert({
        owner_id, ticket_id: form.ticket_id,
        customer_refund_amount: Number(form.customer_refund_amount || 0),
        supplier_retention_amount: Number(form.supplier_retention_amount || 0),
        supplier_refund_amount: Number(form.supplier_refund_amount || 0),
        notes: form.notes || null,
      });
      if (error) throw error;
      await supabase.from("tickets").update({ status: "refunded" }).eq("id", form.ticket_id);
      toast.success("Refund recorded");
      setOpen(false);
      setForm({ ticket_id: "", customer_refund_amount: "0", supplier_retention_amount: "0", supplier_refund_amount: "0", notes: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this refund?")) return;
    const { error } = await supabase.rpc("soft_delete", { _table: "refunds", _id: id });
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  }

  function ticketInfo(id: string) {
    return tickets.find((x) => x.id === id);
  }

  return (
    <div>
      <PageHeader title="Refunds" description="Refund customers and deduct retention from supplier balance.">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-gradient-brand text-white shadow-glow"><Plus className="h-4 w-4 mr-1" /> New refund</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record refund</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div className="space-y-2">
                <Label>Find ticket</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Ticket no, passenger, PNR, route, customer name or phone…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={form.ticket_id} onValueChange={(v) => setForm({ ...form, ticket_id: v })}>
                  <SelectTrigger><SelectValue placeholder={`Choose ticket… (${filteredTickets.length} match${filteredTickets.length === 1 ? "" : "es"})`} /></SelectTrigger>
                  <SelectContent>
                    {filteredTickets.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No matches.</div>}
                    {filteredTickets.map((t) => {
                      const buyer = (t.buyer_type === "customer" ? customers : agents).find((x: any) => x.id === t.buyer_id);
                      const isRefunded = t.status === "refunded";
                      return (
                        <SelectItem key={t.id} value={t.id} disabled={isRefunded}>
                          <span className={isRefunded ? "text-warning line-through opacity-70" : ""}>
                            {isRefunded ? "↩ REFUNDED · " : ""}
                            {t.ticket_no ? `#${t.ticket_no} · ` : ""}{t.passenger_name} — {t.route ?? "—"} · {buyer?.name ?? "—"} ({fmt(t.sale_price)})
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selected && (
                  <div className="text-xs text-muted-foreground">Cost {fmt(selected.cost_price)} · Sale {fmt(selected.sale_price)}</div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Refund to customer/sub-agent</Label>
                <Input type="number" step="0.01" value={form.customer_refund_amount} onChange={(e) => setForm({ ...form, customer_refund_amount: e.target.value })} />
                <p className="text-xs text-muted-foreground">Amount you return to the buyer.</p>
              </div>
              <div className="space-y-2">
                <Label>Supplier retention</Label>
                <Input type="number" step="0.01" value={form.supplier_retention_amount} onChange={(e) => setForm({ ...form, supplier_retention_amount: e.target.value })} />
                <p className="text-xs text-muted-foreground">Penalty the supplier keeps — reduces what you owe them.</p>
              </div>
              <div className="space-y-2">
                <Label>Supplier returns to you</Label>
                <Input type="number" step="0.01" value={form.supplier_refund_amount} onChange={(e) => setForm({ ...form, supplier_refund_amount: e.target.value })} />
                <p className="text-xs text-muted-foreground">Amount supplier refunds back — reduces what you owe them.</p>
              </div>
              <div className="space-y-2"><Label>Notes</Label><Textarea maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button type="submit" className="w-full bg-gradient-brand text-white">Record refund</Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card className="shadow-soft overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Ticket</TableHead>
              <TableHead>Passenger</TableHead>
              <TableHead>Route</TableHead>
              <TableHead className="text-right">To buyer</TableHead>
              <TableHead className="text-right">Supplier retention</TableHead>
              <TableHead className="text-right">Supplier returns</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No refunds yet.</TableCell></TableRow>}
            {rows.map((r) => {
              const t = ticketInfo(r.ticket_id);
              return (
              <TableRow key={r.id} className="hover:bg-muted/40">
                <TableCell className="text-sm">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-sm font-medium">{t?.ticket_no ? `#${t.ticket_no}` : "—"}</TableCell>
                <TableCell className="text-sm font-semibold">{t?.passenger_name ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{t?.route ?? "—"}</TableCell>
                <TableCell className="text-right text-warning font-semibold">{fmt(r.customer_refund_amount)}</TableCell>
                <TableCell className="text-right text-info font-semibold">{fmt(r.supplier_retention_amount)}</TableCell>
                <TableCell className="text-right text-success font-semibold">{fmt(r.supplier_refund_amount)}</TableCell>
                <TableCell className="text-right">{isAdmin && <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
