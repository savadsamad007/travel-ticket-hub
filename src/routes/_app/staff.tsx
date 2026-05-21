import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Plus, Trash2, ShieldCheck, User as UserIcon, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth, type PermKey } from "@/lib/auth";
import { PageHeader } from "@/components/skybird/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_app/staff")({
  component: StaffPage,
});

const SUPABASE_URL = "https://zshyqwviuuhplgyiatdw.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzaHlxd3ZpdXVocGxneWlhdGR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NTYxMDIsImV4cCI6MjA5NDUzMjEwMn0.B-IseFCeGpvJx_2eKprhhm1mphYQb2KorbvX6eWsN50";

const PERM_KEYS: { key: PermKey; label: string }[] = [
  { key: "tickets",    label: "Tickets (sell ticket)" },
  { key: "refunds",    label: "Refunds" },
  { key: "payments",   label: "Payments / Receipts" },
  { key: "customers",  label: "Customers" },
  { key: "suppliers",  label: "Suppliers" },
  { key: "sub_agents", label: "Sub-agents" },
  { key: "cash_book",  label: "Cash in Hand" },
  { key: "reports",    label: "Reports" },
  { key: "statements", label: "Statements" },
];

const DEFAULT_SALESMAN_PERMS = { tickets: true, customers: true, payments: true } as Record<string, boolean>;

function StaffPage() {
  const { user, role, agencyOwner } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "salesman" as "admin" | "salesman" });

  // permissions editor
  const [permEditor, setPermEditor] = useState<{ uid: string; name: string; role: string; perms: Record<string, boolean> } | null>(null);

  async function load() {
    if (!agencyOwner) return;
    const { data, error } = await supabase
      .from("user_agency")
      .select("user_id, role, full_name, permissions, created_at")
      .eq("agency_owner", agencyOwner)
      .order("created_at", { ascending: true });
    if (error) return toast.error(error.message);
    setRows(data ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [agencyOwner]);

  if (role && role !== "admin" && role !== "super_admin") return <Navigate to="/dashboard" />;

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!agencyOwner) return;
    setSaving(true);
    try {
      const tmp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const initialPerms = form.role === "admin" ? {} : DEFAULT_SALESMAN_PERMS;
      const { data: signUpData, error: signUpErr } = await tmp.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            full_name: form.full_name,
            agency_owner: agencyOwner,
            staff_role: form.role,
            permissions: initialPerms,
          },
        },
      });
      if (signUpErr) throw signUpErr;
      const newUserId = signUpData.user?.id;
      if (!newUserId) throw new Error("Could not create user (may already exist)");

      const { error: upErr } = await supabase
        .from("user_agency")
        .upsert(
          {
            user_id: newUserId,
            agency_owner: agencyOwner,
            role: form.role,
            full_name: form.full_name || form.email,
            permissions: initialPerms,
          },
          { onConflict: "user_id" },
        );
      if (upErr) {
        if (signUpData.session) {
          await tmp.auth.setSession({
            access_token: signUpData.session.access_token,
            refresh_token: signUpData.session.refresh_token,
          });
          const { error: claimErr } = await tmp
            .from("user_agency")
            .update({
              agency_owner: agencyOwner,
              role: form.role,
              full_name: form.full_name || form.email,
              permissions: initialPerms,
            })
            .eq("user_id", newUserId);
          if (claimErr) throw upErr;
        } else {
          throw upErr;
        }
      }

      toast.success(`${form.role === "admin" ? "Admin" : "Salesman"} added`);
      setOpen(false);
      setForm({ full_name: "", email: "", password: "", role: "salesman" });
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

  async function savePerms() {
    if (!permEditor) return;
    const { error } = await supabase
      .from("user_agency")
      .update({ permissions: permEditor.perms, full_name: permEditor.name })
      .eq("user_id", permEditor.uid);
    if (error) return toast.error(error.message);
    toast.success("Staff updated");
    setPermEditor(null);
    load();
  }

  return (
    <div>
      <PageHeader title="Staff" description="Add admins or salesmen. Tick exactly which pages each salesman can see.">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-brand text-white shadow-glow"><Plus className="h-4 w-4 mr-1" /> Add staff</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add staff</DialogTitle></DialogHeader>
            <form onSubmit={addStaff} className="space-y-3">
              <div className="space-y-2">
                <Label>Role</Label>
                <div className="flex gap-2">
                  {(["salesman", "admin"] as const).map((r) => (
                    <button key={r} type="button" onClick={() => setForm({ ...form, role: r })}
                      className={`flex-1 px-3 py-2 rounded-md border text-sm font-medium ${form.role === r ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}>
                      {r === "admin" ? "Admin (full access)" : "Salesman (custom perms)"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2"><Label>Full name</Label><Input maxLength={100} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Email *</Label><Input type="email" required maxLength={255} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Temporary password *</Label><Input type="password" required minLength={6} maxLength={72} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <p className="text-xs text-muted-foreground">They'll sign in with this email + password. You can change their permissions later.</p>
              <Button type="submit" disabled={saving} className="w-full bg-gradient-brand text-white">{saving ? "Creating…" : "Create"}</Button>
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
              <TableHead>Permissions</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No staff yet.</TableCell></TableRow>}
            {rows.map((r) => {
              const perms = (r.permissions ?? {}) as Record<string, boolean>;
              const permList = r.role === "admin" || r.role === "super_admin"
                ? "All (admin)"
                : (Object.keys(perms).filter((k) => perms[k]).map((k) => k.replace("_", " ")).join(", ") || "—");
              return (
                <TableRow key={r.user_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {r.role === "admin" || r.role === "super_admin" ? <ShieldCheck className="h-4 w-4 text-primary" /> : <UserIcon className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-medium">{r.full_name ?? "—"}</span>
                      {r.user_id === user?.id && <span className="text-xs text-muted-foreground">(you)</span>}
                    </div>
                  </TableCell>
                  <TableCell><span className={`text-xs px-2 py-1 rounded-full ${r.role === "admin" || r.role === "super_admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{r.role}</span></TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{permList}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="icon" variant="ghost" title="Edit staff"
                      onClick={() => setPermEditor({ uid: r.user_id, name: r.full_name || "", role: r.role, perms: { ...(perms || {}) } })}>
                      <Settings2 className="h-4 w-4" />
                    </Button>
                    {r.user_id !== user?.id && (
                      <Button size="icon" variant="ghost" onClick={() => removeStaff(r.user_id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Permissions editor dialog */}
      <Dialog open={!!permEditor} onOpenChange={(o) => !o && setPermEditor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit staff</DialogTitle>
          </DialogHeader>
          {permEditor && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input maxLength={100} value={permEditor.name}
                  onChange={(e) => setPermEditor({ ...permEditor, name: e.target.value })} />
              </div>
              {permEditor.role === "salesman" ? (
                <>
                  <p className="text-xs text-muted-foreground">Tick which pages this salesman can access. Profit columns and Delete are always hidden for salesmen.</p>
                  <div className="grid grid-cols-2 gap-3 py-1">
                    {PERM_KEYS.map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={!!permEditor.perms[key]}
                          onCheckedChange={(v) =>
                            setPermEditor({ ...permEditor, perms: { ...permEditor.perms, [key]: !!v } })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground rounded-md border bg-muted/40 p-2">Admins have full access — no per-page permissions.</p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() =>
              permEditor && setPermEditor({ ...permEditor, perms: { ...DEFAULT_SALESMAN_PERMS } })
            }>Reset to default</Button>
            <Button onClick={savePerms} className="bg-gradient-brand text-white">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
