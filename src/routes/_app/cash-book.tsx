import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Wallet, TrendingDown, TrendingUp } from "lucide-react";
import { supabase, fmt } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageHeader, StatCard } from "@/components/skybird/ui";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/cash-book")({
  component: CashBookPage,
});

function CashBookPage() {
  const { agencyOwner } = useAuth();
  const [opening, setOpening] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [parties, setParties] = useState<Record<string, string>>({});
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    (async () => {
      if (agencyOwner) {
        const { data } = await supabase.from("agency_profile").select("opening_cash").eq("agency_owner", agencyOwner).maybeSingle();
        setOpening(Number(data?.opening_cash ?? 0));
      }
      const { data: py } = await supabase
        .from("payments")
        .select("*")
        .eq("method", "cash")
        .order("created_at", { ascending: false });
      setRows(py ?? []);

      const [sp, cu, ag] = await Promise.all([
        supabase.from("suppliers").select("id,name"),
        supabase.from("customers").select("id,name"),
        supabase.from("sub_agents").select("id,name"),
      ]);
      const m: Record<string, string> = {};
      for (const x of sp.data ?? []) m[`supplier:${x.id}`] = x.name;
      for (const x of cu.data ?? []) m[`customer:${x.id}`] = x.name;
      for (const x of ag.data ?? []) m[`sub_agent:${x.id}`] = x.name;
      setParties(m);
    })();
  }, [agencyOwner]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (from && r.created_at < from) return false;
    if (to && r.created_at > to + "T23:59:59") return false;
    return true;
  }), [rows, from, to]);

  const cashIn = useMemo(() => filtered.filter((r) => r.direction === "in").reduce((s, r) => s + Number(r.amount), 0), [filtered]);
  const cashOut = useMemo(() => filtered.filter((r) => r.direction === "out").reduce((s, r) => s + Number(r.amount), 0), [filtered]);
  // Note: balance always uses ALL cash movements + opening, regardless of date filter
  const totalIn = useMemo(() => rows.filter((r) => r.direction === "in").reduce((s, r) => s + Number(r.amount), 0), [rows]);
  const totalOut = useMemo(() => rows.filter((r) => r.direction === "out").reduce((s, r) => s + Number(r.amount), 0), [rows]);
  const balance = opening + totalIn - totalOut;

  return (
    <div>
      <PageHeader title="Cash in Hand" description="Live cash balance from all cash payments + opening balance." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Cash balance" value={fmt(balance)} icon={Wallet} gradient="bg-gradient-brand" subtitle={`Opening ${fmt(opening)}`} />
        <StatCard title="Cash received" value={fmt(cashIn)} icon={TrendingUp} gradient="bg-gradient-sky" subtitle="In selected range" />
        <StatCard title="Cash paid out" value={fmt(cashOut)} icon={TrendingDown} gradient="bg-gradient-sunset" subtitle="In selected range" />
        <StatCard title="Net (range)" value={fmt(cashIn - cashOut)} icon={Wallet} gradient="bg-gradient-brand" />
      </div>

      <Card className="shadow-soft p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="space-y-2"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-2"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </Card>

      <Card className="shadow-soft overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">In</TableHead>
              <TableHead className="text-right">Out</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No cash movements.</TableCell></TableRow>}
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-sm">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div>{parties[`${r.party_type}:${r.party_id}`] ?? "—"}</div>
                  <div className="text-xs text-muted-foreground capitalize">{r.party_type.replace("_", "-")}</div>
                </TableCell>
                <TableCell>{r.direction === "in" ? "Received" : "Paid out"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.reference ?? "—"}</TableCell>
                <TableCell className="text-right text-success font-semibold">{r.direction === "in" ? fmt(r.amount) : "—"}</TableCell>
                <TableCell className="text-right text-warning font-semibold">{r.direction === "out" ? fmt(r.amount) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
