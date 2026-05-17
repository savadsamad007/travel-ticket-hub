import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase, fmt } from "@/lib/supabase";
import { getOwnerId, type PartyType } from "@/lib/data";
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

export const Route = createFileRoute("/_app/payments")({
  component: PaymentsPage,
});

function PaymentsPage() {
  const isAdmin = useIsAdmin();
  const [rows, setRows] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    party_type: "customer" as PartyType, party_id: "", direction: "in" as "in"|"out",
    amount: "", method: "cash" as "cash"|"bank"|"credit", reference: "", notes: "",
  });

  async function load() {
    const [py, sp, cu, ag] = await Promise.all([
      supabase.from("payments").select("*").order("created_at", { ascending: false }),
      supabase.from("suppliers").select("id,name"),
      supabase.from("customers").select("id,name"),
      supabase.from("sub_agents").select("id,name"),
    ]);
    setRows(py.data ?? []); setSuppliers(sp.data ?? []); setCustomers(cu.data ?? []); setAgents(ag.data ?? []);
  }
  useEffect(() => { load(); }, []);

  const parties = form.party_type === "supplier" ? suppliers : form.party_type === "sub_agent" ? agents : customers;
  function partyName(t: PartyType, id: string) {
    const list = t === "supplier" ? suppliers : t === "sub_agent" ? agents : customers;
    return list.find((x) => x.id === id)?.name ?? "—";
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.party_id) return toast.error("Pick a party");
    if (!form.amount || Number(form.amount) <= 0) return toast.error("Enter an amount");
    try {
      const owner_id = await getOwnerId();
      const { error } = await supabase.from("payments").insert({
        owner_id,
        party_type: form.party_type, party_id: form.party_id,
        direction: form.direction, amount: Number(form.amount),
        method: form.method, reference: form.reference || null, notes: form.notes || null,
      });
      if (error) throw error;
      toast.success("Payment recorded");
      setOpen(false);
      setForm({ party_type: "customer", party_id: "", direction: "in", amount: "", method: "cash", reference: "", notes: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this payment?")) return;
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  }

  return (
    <div>
      <PageHeader title="Payments" description="Cash, bank transfers & credit — in and out.">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-gradient-brand text-white shadow-glow"><Plus className="h-4 w-4 mr-1" /> New payment</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Direction</Label>
                  <Select value={form.direction} onValueChange={(v: any) => setForm({ ...form, direction: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">Received (in)</SelectItem>
                      <SelectItem value="out">Paid (out)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Party type</Label>
                  <Select value={form.party_type} onValueChange={(v: any) => setForm({ ...form, party_type: v, party_id: "" })}>
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
                <Label>Party</Label>
                <Select value={form.party_id} onValueChange={(v) => setForm({ ...form, party_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                  <SelectContent>{parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Amount (SAR)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select value={form.method} onValueChange={(v: any) => setForm({ ...form, method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank">Bank transfer</SelectItem>
                      <SelectItem value="credit">Credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2"><Label>Reference</Label><Input maxLength={120} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
              <div className="space-y-2"><Label>Notes</Label><Textarea maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button type="submit" className="w-full bg-gradient-brand text-white">Record payment</Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card className="shadow-soft overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No payments yet.</TableCell></TableRow>}
            {rows.map((r) => (
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
                <TableCell className="text-right">{isAdmin && <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
