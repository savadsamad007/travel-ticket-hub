import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Ticket, Wallet, Building2, Users, TrendingUp, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fmt } from "@/lib/supabase";
import { StatCard, PageHeader } from "@/components/skybird/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const [s, setS] = useState({
    tickets: 0, suppliers: 0, customers: 0, agents: 0,
    saleTotal: 0, costTotal: 0, profit: 0,
    cashIn: 0, bankIn: 0, refundCount: 0,
    recent: [] as any[],
  });

  useEffect(() => {
    (async () => {
      const [tc, su, cu, ag, tk, py, rf, rt] = await Promise.all([
        supabase.from("tickets").select("*", { count: "exact", head: true }),
        supabase.from("suppliers").select("*", { count: "exact", head: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase.from("sub_agents").select("*", { count: "exact", head: true }),
        supabase.from("tickets").select("cost_price,sale_price"),
        supabase.from("payments").select("direction,amount,method"),
        supabase.from("refunds").select("*", { count: "exact", head: true }),
        supabase.from("tickets").select("*").order("created_at", { ascending: false }).limit(5),
      ]);
      const sale = (tk.data ?? []).reduce((s, t: any) => s + Number(t.sale_price), 0);
      const cost = (tk.data ?? []).reduce((s, t: any) => s + Number(t.cost_price), 0);
      let cashIn = 0, bankIn = 0;
      for (const p of py.data ?? []) {
        if (p.direction === "in" && p.method === "cash") cashIn += Number(p.amount);
        if (p.direction === "in" && p.method === "bank") bankIn += Number(p.amount);
      }
      setS({
        tickets: tc.count ?? 0, suppliers: su.count ?? 0, customers: cu.count ?? 0, agents: ag.count ?? 0,
        saleTotal: sale, costTotal: cost, profit: sale - cost,
        cashIn, bankIn, refundCount: rf.count ?? 0,
        recent: rt.data ?? [],
      });
    })();
  }, []);

  return (
    <div>
      <PageHeader title="Dashboard" description="Snapshot of your travel agency." />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total tickets" value={String(s.tickets)} icon={Ticket} gradient="bg-gradient-brand" />
        <StatCard title="Total sales" value={fmt(s.saleTotal)} icon={TrendingUp} gradient="bg-gradient-sky" />
        <StatCard title="Net profit" value={fmt(s.profit)} icon={Wallet} gradient="bg-gradient-sunset" subtitle={`Cost ${fmt(s.costTotal)}`} />
        <StatCard title="Refunds" value={String(s.refundCount)} icon={RotateCcw} gradient="bg-gradient-brand" />
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-3 mt-4">
        <StatCard title="Suppliers" value={String(s.suppliers)} icon={Building2} gradient="bg-gradient-sky" />
        <StatCard title="Sub-agents" value={String(s.agents)} icon={Users} gradient="bg-gradient-brand" />
        <StatCard title="Customers" value={String(s.customers)} icon={Users} gradient="bg-gradient-sunset" />
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 mt-4">
        <Card className="shadow-soft">
          <CardHeader><CardTitle>Collections</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Cash received</div>
              <div className="text-xl font-bold text-success">{fmt(s.cashIn)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Bank received</div>
              <div className="text-xl font-bold text-info">{fmt(s.bankIn)}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardHeader><CardTitle>Recent tickets</CardTitle></CardHeader>
          <CardContent>
            {s.recent.length === 0 && <div className="text-sm text-muted-foreground">No tickets yet.</div>}
            <ul className="space-y-2">
              {s.recent.map((t) => (
                <li key={t.id} className="flex justify-between text-sm border-b pb-2 last:border-0">
                  <span className="truncate">{t.passenger_name} · <span className="text-muted-foreground">{t.route ?? "—"}</span></span>
                  <span className="font-semibold">{fmt(t.sale_price)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
