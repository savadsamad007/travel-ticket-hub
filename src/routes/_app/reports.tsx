import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { supabase, fmt } from "@/lib/supabase";
import { useIsAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/skybird/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildLedgerPDF } from "@/lib/pdf";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const isAdmin = useIsAdmin();
  const [tickets, setTickets] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [supplierId, setSupplierId] = useState("all");
  const [agentId, setAgentId] = useState("all");
  const [showProfitState, setShowProfit] = useState(true);
  const showProfit = isAdmin && showProfitState;

  useEffect(() => {
    (async () => {
      const [tk, sv, sp, cu, ag] = await Promise.all([
        supabase.from("tickets").select("*").order("created_at", { ascending: false }),
        supabase.from("ticket_services").select("*"),
        supabase.from("suppliers").select("id,name"),
        supabase.from("customers").select("id,name"),
        supabase.from("sub_agents").select("id,name"),
      ]);
      setTickets(tk.data ?? []); setServices(sv.data ?? []);
      setSuppliers(sp.data ?? []); setCustomers(cu.data ?? []); setAgents(ag.data ?? []);
    })();
  }, []);

  const nameOf = (arr: any[], id: string | null) => arr.find((x) => x.id === id)?.name ?? "—";
  const svcCost = (id: string) => services.filter((s) => s.ticket_id === id).reduce((s, x) => s + Number(x.cost_price), 0);
  const svcSale = (id: string) => services.filter((s) => s.ticket_id === id).reduce((s, x) => s + Number(x.sale_price), 0);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (fromDate && t.created_at < fromDate) return false;
      if (toDate && t.created_at > toDate + "T23:59:59") return false;
      if (supplierId !== "all" && t.supplier_id !== supplierId) return false;
      if (agentId !== "all" && !(t.buyer_type === "sub_agent" && t.buyer_id === agentId)) return false;
      return true;
    });
  }, [tickets, fromDate, toDate, supplierId, agentId]);

  const totals = useMemo(() => {
    let cost = 0, sale = 0;
    for (const t of filtered) {
      cost += Number(t.cost_price) + svcCost(t.id);
      sale += Number(t.sale_price) + svcSale(t.id);
    }
    return { cost, sale, profit: sale - cost, count: filtered.length };
    // eslint-disable-next-line
  }, [filtered, services]);

  function buyerName(t: any) {
    return nameOf(t.buyer_type === "customer" ? customers : agents, t.buyer_id);
  }

  function exportPDF() {
    const cols = ["Date", "Passenger", "Route", "Supplier", "Buyer", "Sale"];
    if (showProfit) cols.push("Cost", "Profit");
    const rows = filtered.map((t) => {
      const cost = Number(t.cost_price) + svcCost(t.id);
      const sale = Number(t.sale_price) + svcSale(t.id);
      const base: (string|number)[] = [
        new Date(t.created_at).toLocaleDateString(),
        t.passenger_name, t.route ?? "—",
        nameOf(suppliers, t.supplier_id), buyerName(t),
        sale,
      ];
      if (showProfit) base.push(cost, sale - cost);
      return base;
    });
    const filters: string[] = [];
    if (fromDate || toDate) filters.push(`Date ${fromDate || "—"} → ${toDate || "—"}`);
    if (supplierId !== "all") filters.push(`Supplier: ${nameOf(suppliers, supplierId)}`);
    if (agentId !== "all") filters.push(`Sub-agent: ${nameOf(agents, agentId)}`);
    const totalsArr = [{ label: "Total sale", value: totals.sale }];
    if (showProfit) totalsArr.push({ label: "Total cost", value: totals.cost }, { label: "Net profit", value: totals.profit });
    buildLedgerPDF({
      title: "Tickets report",
      subtitle: `${filtered.length} ticket(s)`,
      filters: filters.join("  ·  ") || "No filters",
      columns: cols, rows, totals: totalsArr,
    });
  }

  return (
    <div>
      <PageHeader title="Reports" description="Filter and export ticket sales and profit reports.">
        <Button onClick={exportPDF} className="bg-gradient-brand text-white shadow-glow"><Download className="h-4 w-4 mr-1" /> Export PDF</Button>
      </PageHeader>

      <Card className="shadow-soft mb-4">
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div className="space-y-2"><Label>From date</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
          <div className="space-y-2"><Label>To date</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All suppliers</SelectItem>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Sub-agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sub-agents</SelectItem>
                {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-3 pb-1">
              <Switch id="profit" checked={showProfit} onCheckedChange={setShowProfit} />
              <Label htmlFor="profit" className="cursor-pointer">Show profit</Label>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="shadow-soft"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Tickets</div><div className="text-2xl font-bold">{totals.count}</div></CardContent></Card>
        {isAdmin && <Card className="shadow-soft"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total sale</div><div className="text-2xl font-bold text-info">{fmt(totals.sale)}</div></CardContent></Card>}
        {showProfit && <Card className="shadow-soft"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total cost</div><div className="text-2xl font-bold text-warning">{fmt(totals.cost)}</div></CardContent></Card>}
        {showProfit && <Card className="shadow-soft"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Net profit</div><div className={`text-2xl font-bold ${totals.profit >= 0 ? "text-success" : "text-destructive"}`}>{fmt(totals.profit)}</div></CardContent></Card>}
      </div>

      <Card className="shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Passenger</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead className="text-right">Sale</TableHead>
              {showProfit && <TableHead className="text-right">Cost</TableHead>}
              {showProfit && <TableHead className="text-right">Profit</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={showProfit ? 8 : 6} className="text-center py-8 text-muted-foreground">No tickets match these filters.</TableCell></TableRow>}
            {filtered.map((t) => {
              const cost = Number(t.cost_price) + svcCost(t.id);
              const sale = Number(t.sale_price) + svcSale(t.id);
              const profit = sale - cost;
              return (
                <TableRow key={t.id} className="hover:bg-muted/40">
                  <TableCell className="text-sm">{new Date(t.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{t.passenger_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.route ?? "—"}</TableCell>
                  <TableCell className="text-sm">{nameOf(suppliers, t.supplier_id)}</TableCell>
                  <TableCell className="text-sm">{buyerName(t)}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(sale)}</TableCell>
                  {showProfit && <TableCell className="text-right">{fmt(cost)}</TableCell>}
                  {showProfit && <TableCell className={`text-right font-semibold ${profit >= 0 ? "text-success" : "text-destructive"}`}>{fmt(profit)}</TableCell>}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </Card>
    </div>
  );
}
