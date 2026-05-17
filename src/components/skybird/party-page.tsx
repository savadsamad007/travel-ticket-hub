import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase, fmt } from "@/lib/supabase";
import { getOwnerId, computePartyBalance, type PartyType, PARTY_TABLES } from "@/lib/data";
import { useIsAdmin } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/skybird/ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@tanstack/react-router";

export function PartyPage({
  type, title, description, statementBasePath, withOpeningBalance,
}: {
  type: PartyType;
  title: string;
  description: string;
  statementBasePath: string; // e.g. "/statements/supplier"
  withOpeningBalance: boolean;
}) {
  const tbl = PARTY_TABLES[type];
  const isAdmin = useIsAdmin();
  const [rows, setRows] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", opening_balance: "0", notes: "" });

  async function load() {
    const { data, error } = await supabase.from(tbl).select("*").order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setRows(data ?? []);
    const bs: Record<string, number> = {};
    await Promise.all((data ?? []).map(async (r: any) => { bs[r.id] = await computePartyBalance(type, r.id); }));
    setBalances(bs);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [type]);

  function resetForm() {
    setForm({ name: "", phone: "", email: "", opening_balance: "0", notes: "" });
    setEditing(null);
  }
  function startEdit(r: any) {
    setEditing(r);
    setForm({
      name: r.name ?? "", phone: r.phone ?? "", email: r.email ?? "",
      opening_balance: String(r.opening_balance ?? 0), notes: r.notes ?? "",
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const owner_id = await getOwnerId();
      const payload: any = { name: form.name.trim(), phone: form.phone || null, email: form.email || null, notes: form.notes || null };
      if (withOpeningBalance) payload.opening_balance = Number(form.opening_balance || 0);
      if (editing) {
        const { error } = await supabase.from(tbl).update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Updated");
      } else {
        const { error } = await supabase.from(tbl).insert({ ...payload, owner_id });
        if (error) throw error;
        toast.success("Created");
      }
      setOpen(false); resetForm(); load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this entry? This cannot be undone.")) return;
    const { error } = await supabase.from(tbl).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  }

  return (
    <div>
      <PageHeader title={title} description={description}>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-brand text-white shadow-glow hover:opacity-90">
              <Plus className="h-4 w-4 mr-1" /> Add {title.slice(0, -1)}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} {title.slice(0, -1)}</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div className="space-y-2"><Label>Name *</Label><Input value={form.name} required maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} maxLength={40} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} maxLength={255} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              {withOpeningBalance && (
                <div className="space-y-2">
                  <Label>Opening balance (SAR)</Label>
                  <Input type="number" step="0.01" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
                  <p className="text-xs text-muted-foreground">{type === "supplier" ? "Positive = you owe them already." : "Positive = they owe you already."}</p>
                </div>
              )}
              <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} maxLength={1000} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button type="submit" className="w-full bg-gradient-brand text-white">{editing ? "Save changes" : "Create"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card className="shadow-soft overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No entries yet.</TableCell></TableRow>}
            {rows.map((r) => {
              const bal = balances[r.id] ?? 0;
              const positive = bal >= 0;
              const tone = type === "supplier"
                ? (positive ? "text-warning" : "text-success")  // positive = we owe them
                : (positive ? "text-success" : "text-warning"); // positive = they owe us
              return (
                <TableRow key={r.id} className="hover:bg-muted/40">
                  <TableCell>
                    <Link to={statementBasePath} search={{ id: r.id } as any} className="font-medium hover:underline">{r.name}</Link>
                  </TableCell>
                  <TableCell>{r.phone ?? "—"}</TableCell>
                  <TableCell>{r.email ?? "—"}</TableCell>
                  <TableCell className={`text-right font-semibold ${tone}`}>{fmt(bal)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    {isAdmin && <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
