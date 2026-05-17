import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getOwnerId } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function QuickAddCustomer({ onCreated }: { onCreated: (c: { id: string; name: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const owner_id = await getOwnerId();
      const { data, error } = await supabase
        .from("customers")
        .insert({
          owner_id,
          name: form.name.trim(),
          phone: form.phone || null,
          email: form.email || null,
        })
        .select("id, name")
        .single();
      if (error) throw error;
      toast.success("Customer added");
      onCreated(data as any);
      setForm({ name: "", phone: "", email: "" });
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-9">
          <Plus className="h-3.5 w-3.5 mr-1" /> New
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Quick add customer</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-2"><Label>Name *</Label><Input autoFocus required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Phone</Label><Input maxLength={40} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-2"><Label>Email</Label><Input type="email" maxLength={255} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <Button type="submit" disabled={saving} className="w-full bg-gradient-brand text-white">{saving ? "Saving…" : "Create"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
