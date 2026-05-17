import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Plus, Trash2, ShieldCheck, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/skybird/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_app/staff")({
  component: StaffPage,
});

// Read the same URL/anon key used by the main client — for a secondary signUp
// that does NOT replace the admin's current session.
const SUPABASE_URL = "https://zshyqwviuuhplgyiatdw.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzaHlxd3ZpdXVocGxneWlhdGR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NTYxMDIsImV4cCI6MjA5NDUzMjEwMn0.B-IseFCeGpvJx_2eKprhhm1mphYQb2KorbvX6eWsN50";

function StaffPage() {
  const { user, role, agencyOwner } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });

  async function load() {
    if (!agencyOwner) return;
    const { data, error } = await supabase
      .from("user_agency")
      .select("user_id, role, full_name, created_at")
      .eq("agency_owner", agencyOwner)
      .order("created_at", { ascending: true });
    if (error) return toast.error(error.message);
    setRows(data ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [agencyOwner]);

  if (role && role !== "admin") return <Navigate to="/dashboard" />;

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!agencyOwner) return;
    setSaving(true);
    try {
      // isolated client so signUp doesn't replace admin's session
      const tmp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: signUpData, error: signUpErr } = await tmp.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: { data: { full_name: form.full_name } },
      });
      if (signUpErr) throw signUpErr;
      const newUserId = signUpData.user?.id;
      if (!newUserId) throw new Error("Could not create user (may already exist)");

      // upsert as salesman in this agency
      const { error: upErr } = await supabase
        .from("user_agency")
        .upsert(
          { user_id: newUserId, agency_owner: agencyOwner, role: "salesman", full_name: form.full_name || form.email },
          { onConflict: "user_id" },
        );
      if (upErr) throw upErr;

      toast.success("Staff added");
      setOpen(false);
      setForm({ full_name: "", email: "", password: "" });
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  }

  async function removeStaff(uid: string) {
    if (uid === user?.id) return toast.error("You can't remove yourself");
    if (!confirm("Revoke this staff member's access?")) return;
    const { error } = await supabase.from("user_agency").delete().eq("user_id", uid);
    if (error) return toast.error(error.message);
    toast.success("Removed"); load();
  }

  return (
    <div>
      <PageHeader title="Staff" description="Manage who can access your agency. Salesmen can't see profit and can't delete.">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-brand text-white shadow-glow"><Plus className="h-4 w-4 mr-1" /> Add staff</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add salesman</DialogTitle></DialogHeader>
            <form onSubmit={addStaff} className="space-y-3">
              <div className="space-y-2"><Label>Full name</Label><Input maxLength={100} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Email *</Label><Input type="email" required maxLength={255} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Temporary password *</Label><Input type="password" required minLength={6} maxLength={72} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <p className="text-xs text-muted-foreground">They'll sign in with this email + password.</p>
              <Button type="submit" disabled={saving} className="w-full bg-gradient-brand text-white">{saving ? "Creating…" : "Create staff"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card className="shadow-soft overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No staff yet.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.user_id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {r.role === "admin" ? <ShieldCheck className="h-4 w-4 text-primary" /> : <UserIcon className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-medium">{r.full_name ?? "—"}</span>
                    {r.user_id === user?.id && <span className="text-xs text-muted-foreground">(you)</span>}
                  </div>
                </TableCell>
                <TableCell><span className={`text-xs px-2 py-1 rounded-full ${r.role === "admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{r.role}</span></TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  {r.role !== "admin" && (
                    <Button size="icon" variant="ghost" onClick={() => removeStaff(r.user_id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
