import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { withSupabaseRetry } from "@/lib/supabase-session";
import { PageHeader } from "@/components/skybird/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { agencyOwner, role, refreshAgency } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    agency_name: "",
    legal_name: "",
    phone: "",
    email: "",
    address: "",
    cr_number: "",
    vat_number: "",
    logo_url: "",
    opening_cash: "0",
    report_email: "",
    daily_report_enabled: false,
    daily_report_time: "23:59",
  });

  useEffect(() => {
    if (!agencyOwner) return;
    (async () => {
      const { data } = await supabase
        .from("agency_profile")
        .select("*")
        .eq("agency_owner", agencyOwner)
        .maybeSingle();
      if (data) {
        setForm({
          agency_name: data.agency_name ?? "",
          legal_name: data.legal_name ?? "",
          phone: data.phone ?? "",
          email: data.email ?? "",
          address: data.address ?? "",
          cr_number: data.cr_number ?? "",
          vat_number: data.vat_number ?? "",
          logo_url: data.logo_url ?? "",
          opening_cash: String(data.opening_cash ?? 0),
          report_email: (data as any).report_email ?? "",
          daily_report_enabled: Boolean((data as any).daily_report_enabled),
          daily_report_time: (data as any).daily_report_time ?? "23:59",
        });
      }
      setLoading(false);
    })();
  }, [agencyOwner]);

  if (role && role !== "admin" && role !== "super_admin") return <Navigate to="/dashboard" />;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!agencyOwner) return;
    setSaving(true);
    try {
      const basePayload: Record<string, unknown> = {
        agency_owner: agencyOwner,
        agency_name: form.agency_name.trim() || "My Agency",
        legal_name: form.legal_name || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        cr_number: form.cr_number || null,
        vat_number: form.vat_number || null,
        logo_url: form.logo_url || null,
        opening_cash: Number(form.opening_cash || 0),
        updated_at: new Date().toISOString(),
      };
      const fullPayload = {
        ...basePayload,
        report_email: form.report_email || null,
        daily_report_enabled: form.daily_report_enabled,
        daily_report_time: form.daily_report_time || "23:59",
      };
      let { error } = await withSupabaseRetry(
        async () =>
          await supabase.from("agency_profile").upsert(fullPayload, { onConflict: "agency_owner" }),
      );
      if (error && /report_email|daily_report/i.test(error.message)) {
        const res = await withSupabaseRetry(
          async () =>
            await supabase.from("agency_profile").upsert(basePayload, { onConflict: "agency_owner" }),
        );
        error = res.error;
        if (!error) {
          toast.warning("Saved. Run supabase-daily-report.sql to enable daily-report fields.");
          await refreshAgency();
          return;
        }
      }
      if (error) throw error;
      toast.success("Saved");
      await refreshAgency();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div>
      <PageHeader
        title="Agency Settings"
        description="Update your agency identity and starting cash balance."
      />
      <Card className="shadow-soft max-w-2xl">
        <CardContent className="p-6">
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-2">
              <Label>Agency name *</Label>
              <Input
                required
                maxLength={120}
                value={form.agency_name}
                onChange={(e) => setForm({ ...form, agency_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Legal / Trading name</Label>
              <Input
                maxLength={150}
                value={form.legal_name}
                onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  maxLength={40}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  maxLength={255}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea
                maxLength={500}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>CR number</Label>
                <Input
                  maxLength={50}
                  value={form.cr_number}
                  onChange={(e) => setForm({ ...form, cr_number: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>VAT number</Label>
                <Input
                  maxLength={50}
                  value={form.vat_number}
                  onChange={(e) => setForm({ ...form, vat_number: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Logo URL</Label>
              <Input
                type="url"
                maxLength={500}
                value={form.logo_url}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-2">
              <Label>Opening cash in hand (SAR)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.opening_cash}
                onChange={(e) => setForm({ ...form, opening_cash: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Starting cash balance — used by the Cash Book page.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t space-y-3">
              <div>
                <h3 className="font-semibold">Daily report email</h3>
                <p className="text-xs text-muted-foreground">
                  Get a daily summary (tickets, sales, cost, profit, cash) emailed to you.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label className="text-sm">Enable daily report</Label>
                  <p className="text-xs text-muted-foreground">
                    Sends at the time below (server time).
                  </p>
                </div>
                <Switch
                  checked={form.daily_report_enabled}
                  onCheckedChange={(v) => setForm({ ...form, daily_report_enabled: v })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Report email</Label>
                  <Input
                    type="email"
                    maxLength={255}
                    placeholder="owner@yourdomain.com"
                    value={form.report_email}
                    onChange={(e) => setForm({ ...form, report_email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Send time (HH:MM)</Label>
                  <Input
                    type="time"
                    value={form.daily_report_time}
                    onChange={(e) => setForm({ ...form, daily_report_time: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <Button type="submit" disabled={saving} className="bg-gradient-brand text-white">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
