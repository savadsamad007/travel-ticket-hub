import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/_app/refunds")({
  component: RefundsPage,
});

function RefundsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    ticket_id: "", customer_refund_amount: "0",
    supplier_retention_amount: "0", supplier_refund_amount: "0", notes: "",
  });

  async function load() {
    const [rf, tk] = await Promise.all([
      supabase.from("refunds").select("*").order("created_at", { ascending: false }),
      supabase.from("tickets").select("id, passenger_name, route, sale_price, cost_price, status"),
    ]);
    setRows(rf.data ?? []); setTickets(tk.data ?? []);
  }
  useEffect(() => { load(); }, []);

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
    const { error } = await supabase.from("refunds").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  }

  function ticketLabel(id: string) {
    const t = tickets.find((x) => x.id === id);
    return t ? `${t.passenger_name} — ${t.route ?? ""}` : "—";
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
                <Label>Ticket</Label>
                <Select value={form.ticket_id} onValueChange={(v) => setForm({ ...form, ticket_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose ticket…" /></SelectTrigger>
                  <SelectContent>{tickets.map((t) => <SelectItem key={t.id} value={t.id}>{t.passenger_name} — {t.route ?? ""} ({fmt(t.sale_price)})</SelectItem>)}</SelectContent>
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
              <TableHead className="text-right">To buyer</TableHead>
              <TableHead className="text-right">Supplier retention</TableHead>
              <TableHead className="text-right">Supplier returns</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No refunds yet.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id} className="hover:bg-muted/40">
                <TableCell className="text-sm">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-sm">{ticketLabel(r.ticket_id)}</TableCell>
                <TableCell className="text-right text-warning font-semibold">{fmt(r.customer_refund_amount)}</TableCell>
                <TableCell className="text-right text-info font-semibold">{fmt(r.supplier_retention_amount)}</TableCell>
                <TableCell className="text-right text-success font-semibold">{fmt(r.supplier_refund_amount)}</TableCell>
                <TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
